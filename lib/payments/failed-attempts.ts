/**
 * Card attempts THIS client watched fail (Tap to Pay design doc §6.4).
 *
 * WHY THIS EXISTS (found on device): a tap was declined, staff closed the sheet,
 * reopened it, and were told "a card payment is still going through" for minutes.
 *
 * The charge route writes the `booking_payments` row as `pending` when it creates
 * the PaymentIntent, and ONLY the Stripe webhook moves it off `pending`
 * (`payment_intent.payment_failed` → `failed`). Until that lands — in local dev,
 * possibly never — every "is a card payment in flight?" check counts the row, so
 * the sheet's processing gate blocked the staff member from collecting again for
 * a payment they had just watched decline.
 *
 * The client knows better than the ledger here: it has the charge response and it
 * saw the reader's verdict. So a decline is recorded HERE, and the gate/notices
 * discount those rows. The ledger and the payment history still show the row as
 * Processing until the webhook flips it to Failed — that is the webhook's truth
 * and we don't overwrite it — but staff are no longer blocked or warned about a
 * decline they witnessed.
 *
 * Module-level and pure, like `last-method.ts`: a plain store plus a matcher, no
 * React, unit-testable. Deliberately memory-only — a decline that matters beyond
 * an app restart is one the webhook has had ample time to record.
 */

import type { BookingPaymentRow } from '@/types/booking-detail';

/** One attempt this client saw fail, with what it takes to find its ledger row. */
export interface FailedCardAttempt {
  /** The booking the charge was POSTed to (the row's anchor, §5.7). */
  bookingId: string;
  /** Stripe PaymentIntent id from the charge response — the true identity. */
  paymentIntentId: string;
  /** `amount_pence` echoed by the charge route, so it equals the row's exactly. */
  amountPence: number;
  /** Epoch ms just before the charge POST (the row is created inside it). */
  startedAtMs: number;
  /** Epoch ms when the reader reported the failure. */
  failedAtMs: number;
}

/**
 * Allowance for device-clock vs database-clock skew when matching a row by time.
 *
 * FALLBACK ONLY. The booking GET now returns `stripe_payment_intent_id`, so a
 * card row is matched on its PaymentIntent — the row's true identity — and this
 * window is used solely for rows that carry none (older payloads).
 *
 * It is kept because it is still the best available answer for those rows, not
 * because it is a good one. Matching on booking + amount + when cannot rule out
 * mistaking a genuinely in-flight payment for our decline, and the app's OWN
 * retry flow is enough to trigger that: retry a declined £30 within two minutes,
 * have the second attempt fail ambiguously (a network drop after the reader
 * accepted, which `isDefiniteCardFailure` deliberately refuses to record), and
 * the second row matches the FIRST attempt — silencing the double-charge warning
 * on a payment that may well have gone through. Erring narrow is safe: a row
 * outside the window simply keeps warning.
 */
export const ATTEMPT_MATCH_SKEW_MS = 2 * 60_000;

/** Ring-buffer cap: a shift's worth of declines, not an unbounded leak. */
const MAX_TRACKED_ATTEMPTS = 20;

let attempts: FailedCardAttempt[] = [];

/**
 * Record that this client watched a card attempt fail.
 *
 * Only call this when the money definitely did NOT move — see
 * `isDefiniteCardFailure` in `terminal-sdk.ts`. An ambiguous confirm (a network
 * drop after the reader accepted the card) must keep warning, because Stripe may
 * still have captured it.
 */
export function recordFailedCardAttempt(attempt: FailedCardAttempt): void {
  // Same PaymentIntent twice (a re-render, a retried mutation) is one attempt.
  attempts = [
    ...attempts.filter((a) => a.paymentIntentId !== attempt.paymentIntentId),
    attempt,
  ].slice(-MAX_TRACKED_ATTEMPTS);
}

/** Every failure this client has seen, oldest first. */
export function failedCardAttempts(): readonly FailedCardAttempt[] {
  return attempts;
}

/** Test seam. */
export function __resetFailedCardAttemptsForTests(): void {
  attempts = [];
}

/**
 * Is this pending ledger row an attempt this client watched fail?
 *
 * Conservative by construction — every uncertainty answers "no", leaving the
 * warning in place:
 *  - only `pending` `card_present` rows can match at all,
 *  - the amount must be identical (both sides are the server's `amount_pence`),
 *  - the row's booking must be the one we charged, when the payload names it,
 *  - and `created_at` must sit next to `startedAtMs`, within the skew allowance.
 *
 * Both time bounds are anchored to `startedAtMs`, NOT `failedAtMs`: the row is
 * inserted inside the charge POST, so that is where its timestamp actually falls.
 * Anchoring the upper bound to the failure would widen the window by the whole
 * card interaction (10-60s of tapping and PIN entry) for no gain, and every extra
 * second is more room for a colleague's genuine row to be discounted.
 */
export function isKnownFailedCardRow(
  row: BookingPaymentRow,
  known: readonly FailedCardAttempt[] = attempts,
): boolean {
  if (row.method !== 'card_present' || row.status !== 'pending') return false;

  // The row names its PaymentIntent: match on identity and stop. An attempt we
  // did not record is NOT ours, however closely its amount and timing line up —
  // which is exactly the case the time window below cannot tell apart.
  const rowPaymentIntentId = row.stripe_payment_intent_id?.trim();
  if (rowPaymentIntentId) {
    return known.some((a) => a.paymentIntentId === rowPaymentIntentId);
  }

  const createdAtMs = Date.parse(row.created_at);
  // An unreadable timestamp cannot be placed in any window, so keep warning.
  if (Number.isNaN(createdAtMs)) return false;
  return known.some(
    (a) =>
      a.amountPence === row.amount_pence &&
      (row.booking_id == null || row.booking_id === a.bookingId) &&
      createdAtMs >= a.startedAtMs - ATTEMPT_MATCH_SKEW_MS &&
      createdAtMs <= a.startedAtMs + ATTEMPT_MATCH_SKEW_MS,
  );
}
