/**
 * Post-tap settlement watch (Tap to Pay design doc §6.4).
 *
 * `confirmPaymentIntent` resolving is not the payment being settled. The Stripe
 * webhook is the declared source of truth and it lands 1-3 seconds later (or
 * never, in local dev), so the single cache invalidation the card mutation fires
 * refetches the PRE-webhook booking: a paid appointment that still reads
 * "Outstanding £90" with a live Take payment button next to it, and no visible
 * sign that money is already in flight. That is a double charge waiting to
 * happen.
 *
 * The fix is to keep refetching on a short backoff for as long as a card row is
 * `pending`, then stop. Cash and external settlements are written `succeeded`
 * synchronously by the charge route, so they are already correct on the first
 * refetch and never start a watch.
 *
 * Pure module: the delays and the "what are we waiting on" decision live here so
 * they are unit-testable; the timers live in `useBookingDetail`.
 */

import { PENDING_CARD_STALE_MS, pendingCardPayments } from '@/lib/payments/payment-display';
import type { BookingPaymentRow } from '@/types/booking-detail';

/**
 * Backoff between refetches while a card payment settles. Front-loaded to match
 * the webhook's usual latency, and deliberately FINITE: a webhook that never
 * arrives must leave the app idle showing the pending row (see
 * `buildPaymentHistory`), not polling the API for the rest of the shift.
 */
export const SETTLEMENT_POLL_DELAYS_MS: readonly number[] = [2_000, 5_000, 10_000];

/**
 * Past this age a pending row is stuck rather than in flight: its webhook is not
 * coming, and re-polling it every time the booking is opened would be pure
 * noise. Nothing in the app can settle or cancel one of those — see
 * Docs/TAP_TO_PAY.md, "Backend requirements".
 *
 * The SAME window softens the payment sheet's processing gate (see
 * `PENDING_CARD_STALE_MS`), and it is one constant on purpose: "we have stopped
 * waiting for this webhook" and "we no longer block staff behind it" must be the
 * same moment, or the sheet gates on something nothing is watching any more.
 */
export const SETTLEMENT_WATCH_MAX_AGE_MS = PENDING_CARD_STALE_MS;

/** What the booking is currently waiting on. */
export interface SettlementWatch {
  /**
   * Stable identity of the pending rows. Shaped for use as an effect
   * dependency: while the same rows stay pending it does not change, so one
   * backoff chain keeps running instead of restarting on every refetch.
   */
  key: string;
  /**
   * When the newest pending row was created, in epoch ms, so the caller can age
   * it out. `NaN` for an unparseable timestamp, which every comparison then
   * treats as "still in flight" — waiting a few seconds is much cheaper than
   * showing a paid booking as unpaid.
   */
  startedAtMs: number;
}

/**
 * The settlement in flight for this booking, or null when there is nothing to
 * wait for.
 *
 * Deliberately takes no clock: reading `Date.now()` during render is impure, so
 * the age check is left to the caller's effect (against
 * {@link SETTLEMENT_WATCH_MAX_AGE_MS}).
 */
export function settlementWatch(
  payments: BookingPaymentRow[] | null | undefined,
): SettlementWatch | null {
  const pending = pendingCardPayments(payments);
  if (pending.length === 0) return null;
  const key = pending
    .map((p) => p.id)
    .sort()
    .join(',');
  const startedAtMs = pending.reduce((newest, p) => {
    const at = Date.parse(p.created_at);
    if (Number.isNaN(at) || Number.isNaN(newest)) return Number.NaN;
    return Math.max(newest, at);
  }, 0);
  return { key, startedAtMs };
}
