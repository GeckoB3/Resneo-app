/**
 * Thin wrapper around expo-haptics.
 *
 * Centralises tactile feedback so screens use a consistent vocabulary
 * (tap / select / success / warning / error) instead of scattering raw
 * Haptics calls. All calls are fire-and-forget and never throw — haptics are
 * a non-essential enhancement and are unavailable on some devices/simulators.
 */
import * as Haptics from 'expo-haptics';

function safe(run: () => Promise<unknown>): void {
  // Intentionally ignore errors/promise — feedback must never break a flow.
  void run().catch(() => undefined);
}

/** Light tap — for primary button presses and tab changes. */
export function hapticTap(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Selection tick — for toggles, segmented controls, filter chips. */
export function hapticSelect(): void {
  safe(() => Haptics.selectionAsync());
}

/** Success notification — booking created, status confirmed. */
export function hapticSuccess(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification — destructive confirm, no-show. */
export function hapticWarning(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Error notification — failed action. */
export function hapticError(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
