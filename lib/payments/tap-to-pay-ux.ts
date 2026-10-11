import { Platform } from 'react-native';

import type { TapToPayUxConfig, TerminalHookApi } from '@/lib/payments/terminal-sdk';
import { accent } from '@/theme/index';

/**
 * Stripe's Tap to Pay screen on Android, in the colours of the client's own screens (POS test round,
 * 2026-10-11, Part 3). The client chooses a tip on a navy screen, then Stripe's screen takes over:
 * dark, with ResNeo teal marking where to tap, so the phone never flashes white between the two.
 *
 * - `darkMode` is always explicit: the beta.33 bridge turns a missing value into LIGHT.
 * - `tapZone` stays `default`: Stripe knows where each phone's NFC antenna is; we do not.
 * - The colours keep at least 8:1 contrast on Stripe's dark background (#121212).
 *
 * iPhone has nothing to style: Apple's sheet is the system's own.
 */
export const ANDROID_TAP_TO_PAY_UX: TapToPayUxConfig = {
  tapZone: { indicator: 'default' },
  darkMode: 'dark',
  colors: { primary: accent[500], success: '#34D399', error: '#FCA5A5' },
};

let applied = false;

/** Once per app run, Android only. Never throws and never holds up a payment. */
export async function applyTapToPayUx(terminal: Pick<TerminalHookApi, 'setTapToPayUxConfiguration'>): Promise<void> {
  if (applied || Platform.OS !== 'android' || !terminal.setTapToPayUxConfiguration) return;
  try {
    const res = await terminal.setTapToPayUxConfiguration(ANDROID_TAP_TO_PAY_UX);
    if (!res?.error) applied = true;
  } catch {
    // Not initialised yet, or an older binary: the next connect tries again.
  }
}

/** Test seam. */
export function __resetTapToPayUxForTests(): void {
  applied = false;
}
