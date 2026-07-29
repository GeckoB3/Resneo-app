import { useEffect, useState } from 'react';

/**
 * Epoch-ms clock for the pending-card age checks (`pendingCardState`).
 *
 * WHY a hook rather than `Date.now()` where it is needed: those checks feed
 * RENDER — whether the payment sheet hard-gates, and what the booking's payment
 * card says — and reading the clock during render is impure (`react-hooks/purity`,
 * and the same reason `settlement-watch.ts` takes no clock at all). So the clock
 * is read in an effect and kept in state.
 *
 * Returns 0 until the first effect run, which every age check reads as "unknown,
 * assume still in flight" — the safe direction.
 *
 * It ticks only while `active`, because the only thing it can change is a pending
 * row ageing past the stale window; a booking with nothing in flight must not
 * re-render on a timer.
 */

/** How often to re-check the age. The window is minutes, so this is plenty. */
export const PENDING_CARD_TICK_MS = 30_000;

export function usePendingCardClock(active: boolean): number {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the effect IS the clock read; render must stay pure
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), PENDING_CARD_TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  return nowMs;
}
