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
import { getSupabase } from '@/lib/supabase';
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
  /** True while the lock overlay covers the app (raised on background, cleared after unlock on resume). */
  isLocked: boolean;
  /** True while a biometric prompt is on screen (drives the cover's busy state). */
  authInFlight: boolean;
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

  // ── Distinguish a REAL resume from our own prompt's AppState churn ─────────
  // The lock must engage only on a genuine background→foreground cycle. We track
  // that with an explicit flag set ONLY on a real `background` event. A biometric
  // prompt drives the app active → inactive → active (iOS) or briefly drops focus
  // (some Androids) but NEVER reaches `background`, so it can't set this flag and
  // therefore can't be mistaken for a resume — the bug behind the iOS lock loop.
  //
  // (Inferring the resume from `prev === 'inactive'` instead, as before, matched
  // the prompt's trailing `active` too. A boolean guard that cleared on the first
  // `active` then leaked on iOS's EXTRA inactive↔active churn, re-locking forever.)
  const wentToBackgroundRef = useRef(false);

  // True only while OUR biometric prompt is on screen, so the AppState listener
  // ignores the churn the prompt itself produces. Cleared the instant the prompt
  // resolves — the trailing `active` that lands just after is already harmless
  // (it can't set `wentToBackground`, so it never arms the lock).
  const promptInFlightRef = useRef(false);

  // Every biometric prompt MUST go through this wrapper so the AppState listener
  // can tell "I'm showing the prompt" from "the user left the app".
  const guardedAuthPrompt = useCallback(async (promptMessage: string): Promise<boolean> => {
    promptInFlightRef.current = true;
    try {
      return await runAuthPrompt(promptMessage);
    } finally {
      promptInFlightRef.current = false;
    }
  }, []);

  const unlock = useCallback(async () => {
    // Re-entrancy guard: ignore taps while a prompt is already showing.
    if (authInFlight) return;
    setAuthInFlight(true);
    try {
      const ok = await guardedAuthPrompt('Unlock Resneo');
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
  }, [authInFlight, guardedAuthPrompt]);

  // The AppState listener is registered once; reach the latest `unlock` via a ref
  // so it never re-subscribes (and never captures a stale closure).
  const unlockRef = useRef(unlock);
  useEffect(() => {
    unlockRef.current = unlock;
  }, [unlock]);

  const lockShownRef = useRef(false);

  // ── Cover on background; prompt on a genuine resume ───────────────────────
  // We raise the cover as the app LEAVES the foreground (→ background), BEFORE
  // the OS captures the app-switcher / recents thumbnail — otherwise the snapshot
  // shows client PII. We deliberately cover on `background` and NOT the transient
  // `inactive` (which also fires for the biometric prompt itself and the Control
  // Centre / notification pull-down), so neither re-triggers the cover. The
  // unlock prompt is deferred until the app is visible (`active`) again.
  //
  // The unlock prompt fires only when `wentToBackground` is set — i.e. after a
  // REAL background, never for the prompt's own active↔inactive churn — so the
  // prompt can't trigger another prompt (the iOS "Resneo is locked" loop).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      appStateRef.current = next;

      // Ignore everything our OWN biometric prompt emits while it's on screen.
      if (promptInFlightRef.current) return;

      if (!appLockEnabledRef.current || !supportedRef.current) return;

      if (next === 'background') {
        // A real backgrounding: remember a resume is now pending and cover.
        wentToBackgroundRef.current = true;
        if (!isLockedRef.current) setIsLocked(true);
        return;
      }

      // Only a genuine return from background unlocks. Consume the flag so the
      // prompt we're about to raise (and its trailing `active`) is a no-op here.
      if (next === 'active' && wentToBackgroundRef.current) {
        wentToBackgroundRef.current = false;
        if (!isLockedRef.current) {
          // Resumed uncovered (e.g. backgrounded before the lock was armed) —
          // cover now; the active-guarded effect below fires the prompt.
          setIsLocked(true);
        } else if (!lockShownRef.current) {
          // Already covered while backgrounded (where the effect stays quiet),
          // so kick off the unlock prompt here, exactly once.
          lockShownRef.current = true;
          void unlockRef.current();
        }
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  // Auto-attempt the prompt ONCE when the overlay appears WHILE THE APP IS ACTIVE
  // (the cover raised on background must stay silent until resume), so a returning
  // user normally just sees Face ID rather than having to tap Unlock. A failure
  // leaves the manual retry button (no loop).
  useEffect(() => {
    if (isLocked && !lockShownRef.current && appStateRef.current === 'active') {
      lockShownRef.current = true;
      void unlock();
    } else if (!isLocked) {
      lockShownRef.current = false;
    }
  }, [isLocked, unlock]);

  // ── Reset on sign-out (shared-device safety) ──────────────────────────────
  // The lock preference is stored per-DEVICE. Without this, a user who enabled
  // biometric lock and then signed out would leave the NEXT user on the same
  // device gated by — and unable to clear — a lock they never set. On SIGNED_OUT
  // drop the persisted preference and dismiss any overlay so the next session
  // starts unlocked (re-enabling is one tap in Settings).
  useEffect(() => {
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      setAppLockEnabledState(false);
      setIsLocked(false);
      lockShownRef.current = false;
      wentToBackgroundRef.current = false;
      promptInFlightRef.current = false;
      if (Platform.OS !== 'web') {
        SecureStore.deleteItemAsync(APP_LOCK_KEY).catch(() => {
          /* best-effort: a failed delete just leaves an inert preference */
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const setAppLockEnabled = useCallback(
    async (next: boolean): Promise<boolean> => {
      // Can't arm a lock the device can't open.
      if (next && !supportedRef.current) return false;

      // Enabling requires proving identity first; disabling is allowed freely
      // (the gate is already cleared — you can only reach Settings unlocked).
      if (next) {
        const ok = await guardedAuthPrompt('Confirm to turn on biometric lock');
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

      // Turning the lock OFF clears any pending resume so a later re-enable can't
      // inherit a stale "was backgrounded" flag and lock the instant it arms.
      if (!next) wentToBackgroundRef.current = false;

      setAppLockEnabledState(next);
      return true;
    },
    [guardedAuthPrompt],
  );

  const value = useMemo<AppLockContextValue>(
    () => ({ appLockEnabled, setAppLockEnabled, supported, isLocked, authInFlight, unlock }),
    [appLockEnabled, setAppLockEnabled, supported, isLocked, authInFlight, unlock],
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
/**
 * The lock cover, renderable from INSIDE a native modal.
 *
 * The provider's own cover is a sibling of the app tree, and every Sheet in the
 * app is a React Native `Modal` — a SEPARATE native window (a UIViewController
 * on iOS, a Dialog on Android). No `zIndex` or `elevation` in the root view can
 * paint over that, so backgrounding the app with a booking sheet open left the
 * client's name, phone and notes in the app-switcher snapshot and fully visible
 * (and interactive) behind a cancelled Face ID prompt — on exactly the screens
 * holding the most PII.
 *
 * Rendering this inside the modal puts a cover in that window too. It reads the
 * context directly and returns null when there is no provider, so a Sheet in a
 * test tree renders unchanged.
 */
export function AppLockCover(): React.JSX.Element | null {
  const ctx = useContext(AppLockContext);
  if (!ctx?.isLocked) return null;
  return <LockOverlay onUnlock={() => void ctx.unlock()} busy={ctx.authInFlight} />;
}

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
