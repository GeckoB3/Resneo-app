/**
 * Thin wrapper around expo-haptics.
 *
 * Centralises tactile feedback so screens use a consistent vocabulary
 * (tap / select / success / warning / error) instead of scattering raw
 * Haptics calls. All calls are fire-and-forget and never throw — haptics are
 * a non-essential enhancement and are unavailable on some devices/simulators.
 *
 * Every call must respect the device's own settings (2026-09-20):
 *
 * - iOS: `UIFeedbackGenerator` (impact / selection / notification) is silenced
 *   by the system when Settings > Sounds & Haptics > System Haptics is off, or
 *   Accessibility > Touch > Vibration is off. Nothing to do here.
 * - Android: expo-haptics implements impact / selection / notification with the
 *   raw `Vibrator` API, which ignores the "Touch feedback" (haptic feedback)
 *   setting and the "Vibration & haptics" master switch, so a phone with
 *   vibration turned off still buzzed. `performAndroidHapticsAsync` goes through
 *   `View.performHapticFeedback`, which the system suppresses when those
 *   settings are off (and needs no VIBRATE permission). Expo's own docs say the
 *   Vibrator path is not recommended for this reason.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function safe(run: () => Promise<unknown>): void {
  // Intentionally ignore errors/promise — feedback must never break a flow.
  void run().catch(() => undefined);
}

/** Android's `HapticFeedbackConstants` CONFIRM / REJECT arrived in API 30 (Android 11). */
function androidApiLevel(): number {
  const v = Platform.Version;
  return typeof v === 'number' ? v : Number.parseInt(String(v), 10) || 0;
}

/**
 * The Android effect for each of our five cues. Older API levels get a constant
 * that exists there (the native module throws for a missing one, which `safe`
 * would swallow into no feedback at all).
 */
function androidEffect(cue: 'tap' | 'select' | 'success' | 'warning' | 'error'): Haptics.AndroidHaptics {
  const api = androidApiLevel();
  switch (cue) {
    case 'tap':
      return Haptics.AndroidHaptics.Virtual_Key;
    case 'select':
      return Haptics.AndroidHaptics.Clock_Tick;
    case 'success':
      return api >= 30 ? Haptics.AndroidHaptics.Confirm : Haptics.AndroidHaptics.Virtual_Key;
    case 'warning':
      return Haptics.AndroidHaptics.Long_Press;
    case 'error':
      return api >= 30 ? Haptics.AndroidHaptics.Reject : Haptics.AndroidHaptics.Long_Press;
  }
}

function android(cue: 'tap' | 'select' | 'success' | 'warning' | 'error'): void {
  safe(() => Haptics.performAndroidHapticsAsync(androidEffect(cue)));
}

/** Light tap — for primary button presses and tab changes. */
export function hapticTap(): void {
  if (Platform.OS === 'android') return android('tap');
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Selection tick — for toggles, segmented controls, filter chips. */
export function hapticSelect(): void {
  if (Platform.OS === 'android') return android('select');
  safe(() => Haptics.selectionAsync());
}

/** Success notification — booking created, status confirmed. */
export function hapticSuccess(): void {
  if (Platform.OS === 'android') return android('success');
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification — destructive confirm, no-show. */
export function hapticWarning(): void {
  if (Platform.OS === 'android') return android('warning');
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Error notification — failed action. */
export function hapticError(): void {
  if (Platform.OS === 'android') return android('error');
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
