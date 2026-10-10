import { useEffect } from 'react';

/**
 * How many full-screen overlays are open right now: every bottom sheet (`Sheet`) and the other
 * React Native `Modal`s (the app update prompt, the Tap to Pay introduction, the camera scanner).
 *
 * A `Modal` is its own native window, so nothing drawn in the app's layout can appear over it. The
 * in-app prompt for a sale sent to this phone (`CollectRequestPrompt`) reads this count and, while
 * anything is open (a payment sheet, a client holding the phone for a tip), leaves the phone's own
 * notification banner to do the telling instead.
 */
let open = 0;

export function openOverlayCount(): number {
  return open;
}

/** Counts this overlay as open while `visible` is true. */
export function useOverlayOpen(visible: boolean): void {
  useEffect(() => {
    if (!visible) return;
    open += 1;
    return () => {
      open -= 1;
    };
  }, [visible]);
}
