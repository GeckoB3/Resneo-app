import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AppStateStatus,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { captureException } from '@/lib/observability';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** SecureStore key — same `reserveni.*` namespace the Supabase adapter uses. */
const APP_LOCK_KEY = 'reserveni.security.appLockEnabled';

type AppLockContextValue = {
  /** User preference — whether biometric lock is armed. OFF by default. */
  appLockEnabled: boolean;
  /**
   * Turn the lock on/off. Enabling requires a successful biometric auth (so a
   * passer-by can't arm a lock the owner can't open); returns whether it stuck.
   */
  setAppLockEnabled: (next: boolean) => Promise<boolean>;
  /** True only when the device has biometric hardware AND an enrolled biometric. */
  supported: boolean;
  /** True while the lock overlay is covering the app (resume-from-background). */
  isLocked: boolean;
  /** Manually trigger the unlock prompt (the overlay's "Unlock" button). */
  unlock: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

/** Defensive wrapper: a missing module / unsupported device resolves to false. */
async function detectBiometricSupport(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    return await LocalAuthentication.isEnrolledAsync();
  } catch (err) {
    captureException(err, { scope: 'app-lock.detect' });
    return false;
  }
}

/** Run a single biometric prompt. Never throws — failures resolve to false. */
async function runAuthPrompt(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // Let the OS fall back to passcode/PIN so a transient biometric failure
      // (wet finger, mask) can never permanently lock the user out.
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
    return result.success === true;
  } catch (err) {
    captureException(err, { scope: 'app-lock.authenticate' });
    return false;
  }
}

type AppLockProviderProps = {
  children: ReactNode;
};

/**
 * Optional biometric gate (W9.1). OFF by default and fully opt-in.
 *
 * When enabled on a supported device, returning to the app from the background
 * raises a full-screen overlay that the user clears with Face ID / fingerprint.
 * Designed to be impossible to crash or hard-lock:
 *   - every native call is wrapped; an unsupported device disarms the lock.
 *   - the overlay always offers a retry button (no infinite prompt loop, no
 *     permanent lockout) and falls back to the device passcode.
 *   - it never locks on cold start — only on resume once a setting exists.
 */
export function AppLockProvider({ children }: AppLockProviderProps) {
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [supported, setSupported] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  // True while a prompt is on screen — guards against double-taps / re-entrancy.
  const [authInFlight, setAuthInFlight] = useState(false);

  // Refs mirror state for the AppState listener, whose closure is created once.
  // Synced in an effect (not during render) so the once-registered listener and
  // setAppLockEnabled always read the latest values.
  const appLockEnabledRef = useRef(appLockEnabled);
  const supportedRef = useRef(supported);
  const isLockedRef = useRef(isLocked);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    appLockEnabledRef.current = appLockEnabled;
    supportedRef.current = supported;
    isLockedRef.current = isLocked;
  }, [appLockEnabled, supported, isLocked]);

  // ── Load persisted preference + detect support once on mount ──────────────
  useEffect(() => {
    let active = true;
    (async () => {
      const isSupported = await detectBiometricSupport();
      let enabled = false;
      try {
        if (Platform.OS !== 'web') {
          enabled = (await SecureStore.getItemAsync(APP_LOCK_KEY)) === 'true';
        }
      } catch (err) {
        captureException(err, { scope: 'app-lock.load' });
      }
      if (!active) return;
      setSupported(isSupported);
      // If the device lost biometric support (removed enrolment), the lock is
      // inert — keep the stored preference but it simply won't engage.
      setAppLockEnabledState(enabled);
    })();
    return () => {
      active = false;
    };
  }, []);

  const unlock = useCallback(async () => {
    // Re-entrancy guard: ignore taps while a prompt is already showing.
    if (authInFlight) return;
    setAuthInFlight(true);
    try {
      const ok = await runAuthPrompt('Unlock Resneo');
      if (ok) {
        hapticSuccess();
        setIsLocked(false);
      } else {
        hapticError();
        // Stay locked — the overlay keeps its "Unlock" retry button visible.
      }
    } finally {
      setAuthInFlight(false);
    }
  }, [authInFlight]);

  // ── Lock on resume-from-background ────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      const cameToForeground =
        next === 'active' && (prev === 'background' || prev === 'inactive');
      if (
        cameToForeground &&
        appLockEnabledRef.current &&
        supportedRef.current &&
        !isLockedRef.current
      ) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Auto-attempt the prompt ONCE when the overlay first appears, so a returning
  // user normally just sees Face ID rather than having to tap Unlock. A failure
  // leaves the manual retry button (no loop).
  const lockShownRef = useRef(false);
  useEffect(() => {
    if (isLocked && !lockShownRef.current) {
      lockShownRef.current = true;
      void unlock();
    } else if (!isLocked) {
      lockShownRef.current = false;
    }
  }, [isLocked, unlock]);

  const setAppLockEnabled = useCallback(
    async (next: boolean): Promise<boolean> => {
      // Can't arm a lock the device can't open.
      if (next && !supportedRef.current) return false;

      // Enabling requires proving identity first; disabling is allowed freely
      // (the gate is already cleared — you can only reach Settings unlocked).
      if (next) {
        const ok = await runAuthPrompt('Confirm to turn on biometric lock');
        if (!ok) return false;
      }

      try {
        if (Platform.OS !== 'web') {
          if (next) {
            await SecureStore.setItemAsync(APP_LOCK_KEY, 'true');
          } else {
            await SecureStore.deleteItemAsync(APP_LOCK_KEY);
          }
        }
      } catch (err) {
        captureException(err, { scope: 'app-lock.persist' });
        // Persist failed — don't claim a state we couldn't save.
        return false;
      }

      setAppLockEnabledState(next);
      return true;
    },
    [],
  );

  const value = useMemo<AppLockContextValue>(
    () => ({ appLockEnabled, setAppLockEnabled, supported, isLocked, unlock }),
    [appLockEnabled, setAppLockEnabled, supported, isLocked, unlock],
  );

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {isLocked ? <LockOverlay onUnlock={() => void unlock()} busy={authInFlight} /> : null}
    </AppLockContext.Provider>
  );
}

/**
 * Full-screen opaque cover shown while locked. Sits above app content (it's the
 * last child of the provider) so client records are never visible behind it.
 *
 * The overlay intentionally covers ALL content, including the Toast host: its
 * high elevation paints above sibling toasts on Android, so a toast fired during
 * the unlock flow would be hidden behind it. Unlock feedback therefore relies on
 * the on-screen overlay UI (the spinner / "Unlock" retry button) plus haptics,
 * never toasts.
 */
function LockOverlay({ onUnlock, busy }: { onUnlock: () => void; busy: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      // Cover the whole window; opaque background hides everything behind it.
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
      accessibilityLabel="Resneo is locked">
      <View style={[styles.card, { paddingBottom: insets.bottom + spacing.xl }]}>
        <SymbolView
          name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
          tintColor={colors.brand}
          size={56}
        />
        <Text variant="title" style={styles.title}>
          Resneo is locked
        </Text>
        <Text variant="bodySmall" tone="secondary" style={styles.subtitle}>
          Unlock with Face ID or your device passcode to view client records.
        </Text>
        <View style={styles.actionSlot}>
          {busy ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            // Plain Pressable styled as a primary button — kept dependency-free
            // (RN core only) so the overlay can't fail to render if a shared UI
            // primitive changes.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Unlock"
              onPress={onUnlock}
              hitSlop={8}
              style={({ pressed }) => [
                styles.unlockBtn,
                { backgroundColor: colors.brand, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Text variant="bodyMedium" color={colors.onBrand}>
                Unlock
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** Read app-lock state anywhere under AppProviders. */
export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error('useAppLock must be used within an AppLockProvider.');
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    // Above sheets/modals AND the Toast host within the app; on Android this
    // elevation paints over sibling toasts, so unlock feedback uses the overlay
    // UI + haptics, not toasts. The OS biometric prompt still sits above this,
    // which is correct.
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    maxWidth: 420,
  },
  title: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  actionSlot: {
    marginTop: spacing.lg,
    minHeight: 48,
    justifyContent: 'center',
  },
  unlockBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
