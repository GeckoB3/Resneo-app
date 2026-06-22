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

/**
 * How long the AppState guard stays armed after a biometric prompt resolves.
 *
 * A prompt drives the app `active → inactive → active`. The closing `active`
 * event can arrive AFTER `authenticateAsync` resolves, so we keep ignoring
 * AppState changes for a short window as a fallback (the listener also clears
 * the guard the moment it sees that trailing `active`). Without this, the
 * prompt's own churn is mistaken for a background→foreground resume, which
 * re-raises the lock and immediately re-prompts — a permanent "Resneo is
 * locked" loop. Comfortably longer than the JS-thread delivery gap.
 */
const PROMPT_GUARD_COOLDOWN_MS = 600;

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

  // ── Guard against our OWN biometric prompt's AppState churn ───────────────
  // Showing a prompt drives the app active → inactive → active. The AppState
  // listener can't otherwise tell that flicker apart from a real
  // background→foreground resume, so it would re-raise the lock the moment the
  // prompt closes and immediately re-prompt — an infinite lock loop. We mark
  // our own prompt as the cause and have the listener ignore AppState changes
  // while it's armed (cleared on the prompt's trailing `active`, with a timeout
  // fallback in case that event never arrives).
  const promptActiveRef = useRef(false);
  const promptCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPromptGuard = useCallback(() => {
    promptActiveRef.current = false;
    if (promptCooldownRef.current) {
      clearTimeout(promptCooldownRef.current);
      promptCooldownRef.current = null;
    }
  }, []);

  // Every biometric prompt MUST go through this wrapper so the AppState listener
  // can distinguish "I'm showing the prompt" from "the user left the app".
  const guardedAuthPrompt = useCallback(
    async (promptMessage: string): Promise<boolean> => {
      clearPromptGuard();
      promptActiveRef.current = true;
      try {
        return await runAuthPrompt(promptMessage);
      } finally {
        // The closing prompt's `active` event may land AFTER this resolves;
        // keep the guard up briefly so it's still ignored, then re-arm normal
        // resume detection. The listener clears it sooner if it sees that
        // `active` first — this is the belt-and-braces fallback.
        promptCooldownRef.current = setTimeout(clearPromptGuard, PROMPT_GUARD_COOLDOWN_MS);
      }
    },
    [clearPromptGuard],
  );

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

  // ── Cover on background; prompt on resume ─────────────────────────────────
  // We raise the cover as the app LEAVES the foreground (→ background), BEFORE
  // the OS captures the app-switcher / recents thumbnail — otherwise the snapshot
  // shows client PII. We deliberately cover on `background` and NOT the transient
  // `inactive` (which also fires for the biometric prompt itself and the Control
  // Centre / notification pull-down), so neither re-triggers the cover. The
  // unlock prompt is deferred until the app is visible (`active`) again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      // Ignore the inactive↔active churn caused by our OWN biometric prompt so
      // it's never mistaken for a background→foreground resume (which would
      // re-lock and re-prompt forever). This MUST run before the enabled check:
      // enabling flips `appLockEnabled` true *during* the confirm prompt, so the
      // prompt's trailing `active` would otherwise be read as a resume the
      // instant the lock arms. Re-arm on that trailing `active`.
      if (promptActiveRef.current) {
        if (next === 'active') clearPromptGuard();
        return;
      }

      if (!appLockEnabledRef.current || !supportedRef.current) return;

      if (next === 'background' && !isLockedRef.current) {
        setIsLocked(true);
        return;
      }

      const cameToForeground =
        next === 'active' && (prev === 'background' || prev === 'inactive');
      if (cameToForeground) {
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
      clearPromptGuard();
    };
  }, [clearPromptGuard]);

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
      clearPromptGuard();
      if (Platform.OS !== 'web') {
        SecureStore.deleteItemAsync(APP_LOCK_KEY).catch(() => {
          /* best-effort: a failed delete just leaves an inert preference */
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [clearPromptGuard]);

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

      setAppLockEnabledState(next);
      return true;
    },
    [guardedAuthPrompt],
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
