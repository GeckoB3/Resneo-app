import {
  ATTEMPT_MATCH_SKEW_MS,
  failedCardAttempts,
  isKnownFailedCardRow,
  recordFailedCardAttempt,
  __resetFailedCardAttemptsForTests,
  type FailedCardAttempt,
} from '@/lib/payments/failed-attempts';
import type { BookingPaymentRow } from '@/types/booking-detail';

/**
 * Attempts this client watched fail (Tap to Pay design doc §6.4).
 *
 * The stakes cut both ways, so every case below is really about one of two
 * mistakes: forgetting a decline (staff are blocked from collecting by a payment
 * they watched fail) or claiming a decline that wasn't ours (a genuinely in-flight
 * payment stops warning, and the client is charged twice).
 */

const STARTED = Date.parse('2026-07-29T10:00:00Z');
const FAILED = STARTED + 8_000;

const attempt = (over: Partial<FailedCardAttempt> = {}): FailedCardAttempt => ({
  bookingId: 'bk-1',
  paymentIntentId: 'pi_1',
  amountPence: 2500,
  startedAtMs: STARTED,
  failedAtMs: FAILED,
  ...over,
});

const row = (over: Partial<BookingPaymentRow> = {}): BookingPaymentRow => ({
  id: 'pay-1',
  booking_id: 'bk-1',
  method: 'card_present',
  status: 'pending',
  amount_pence: 2500,
  note: null,
  created_at: new Date(STARTED + 500).toISOString(),
  ...over,
});

beforeEach(() => {
  __resetFailedCardAttemptsForTests();
});

describe('recordFailedCardAttempt', () => {
  it('keeps the failure so a later render can discount its ledger row', () => {
    recordFailedCardAttempt(attempt());
    expect(failedCardAttempts()).toHaveLength(1);
    expect(isKnownFailedCardRow(row())).toBe(true);
  });

  it('counts the same PaymentIntent once, however often it is reported', () => {
    // A retried mutation or a re-render must not grow the store without bound.
    recordFailedCardAttempt(attempt());
    recordFailedCardAttempt(attempt({ failedAtMs: FAILED + 1_000 }));
    expect(failedCardAttempts()).toHaveLength(1);
  });

  it('keeps only recent failures rather than growing for ever', () => {
    for (let i = 0; i < 30; i += 1) {
      recordFailedCardAttempt(attempt({ paymentIntentId: `pi_${i}` }));
    }
    expect(failedCardAttempts().length).toBeLessThanOrEqual(20);
    // The newest survive: an old decline is one the webhook has had time to record.
    expect(failedCardAttempts().at(-1)?.paymentIntentId).toBe('pi_29');
  });
});

describe('isKnownFailedCardRow', () => {
  const known = [attempt()];

  it('matches the pending row the failed attempt created', () => {
    expect(isKnownFailedCardRow(row(), known)).toBe(true);
  });

  it('tolerates an older payload that omits booking_id', () => {
    expect(isKnownFailedCardRow(row({ booking_id: undefined }), known)).toBe(true);
  });

  it('ignores a row on another booking', () => {
    expect(isKnownFailedCardRow(row({ booking_id: 'bk-2' }), known)).toBe(false);
  });

  it('ignores a different amount', () => {
    // A colleague collecting something else on another device is not our decline.
    expect(isKnownFailedCardRow(row({ amount_pence: 1000 }), known)).toBe(false);
  });

  it('ignores a row created outside the attempt window', () => {
    // The booking GET does not expose the PaymentIntent id, so the window is what
    // keeps a LATER identical payment from being mistaken for our decline.
    const later = new Date(FAILED + ATTEMPT_MATCH_SKEW_MS + 60_000).toISOString();
    expect(isKnownFailedCardRow(row({ created_at: later }), known)).toBe(false);
  });

  it('anchors the window to when the attempt STARTED, not when it failed', () => {
    /**
     * The row is inserted inside the charge POST, so its `created_at` sits next to
     * `startedAtMs`. Anchoring the upper bound to `failedAtMs` would widen the
     * window by the whole card interaction for no gain, and every extra second is
     * more room for a colleague's genuine same-amount row to be discounted.
     */
    const justPastStart = new Date(STARTED + ATTEMPT_MATCH_SKEW_MS + 1_000).toISOString();
    expect(isKnownFailedCardRow(row({ created_at: justPastStart }), known)).toBe(false);
    // ...while the same instant measured from the failure would still be inside.
    expect(Date.parse(justPastStart)).toBeLessThan(FAILED + ATTEMPT_MATCH_SKEW_MS);
  });

  it('allows for clock skew between the device and the database', () => {
    const skewed = new Date(STARTED - ATTEMPT_MATCH_SKEW_MS + 1_000).toISOString();
    expect(isKnownFailedCardRow(row({ created_at: skewed }), known)).toBe(true);
  });

  it('only ever discounts a pending card row', () => {
    // A succeeded or refunded row is the ledger's business, not this store's.
    expect(isKnownFailedCardRow(row({ status: 'succeeded' }), known)).toBe(false);
    expect(isKnownFailedCardRow(row({ status: 'failed' }), known)).toBe(false);
    expect(isKnownFailedCardRow(row({ method: 'cash' }), known)).toBe(false);
  });

  it('keeps warning when the row has no usable timestamp', () => {
    // Unplaceable in any window, so the safe answer is "still warn".
    expect(isKnownFailedCardRow(row({ created_at: 'not-a-date' }), known)).toBe(false);
  });

  it('knows nothing when no failure has been recorded', () => {
    expect(isKnownFailedCardRow(row(), [])).toBe(false);
  });
});

/**
 * Matching by PaymentIntent (the row's true identity).
 *
 * The booking GET now returns `stripe_payment_intent_id`. Before the app read
 * it, the only join available was booking + amount + a two-minute window — and
 * the app's OWN retry flow defeats that, which is the scenario pinned below.
 */
describe('isKnownFailedCardRow — matched on the PaymentIntent', () => {
  it('recognises our decline by its intent, whatever the clock says', () => {
    recordFailedCardAttempt(attempt({ paymentIntentId: 'pi_1' }));
    // Hours later — a time window would have given up long ago.
    const late = row({
      stripe_payment_intent_id: 'pi_1',
      created_at: new Date(STARTED + 6 * 60 * 60_000).toISOString(),
    });
    expect(isKnownFailedCardRow(late)).toBe(true);
  });

  it('does NOT claim a retry we never saw fail — the double-charge case', () => {
    /**
     * £30 declines (pi_1). Staff retry ~40s later; that second attempt fails
     * AMBIGUOUSLY (network drop after the reader accepted), so it is deliberately
     * not recorded — the warning must stay up because Stripe may have captured it.
     * Its row sits well inside pi_1's ±2min window with an identical amount, so
     * the old heuristic silenced the warning and staff charged the client again.
     */
    recordFailedCardAttempt(attempt({ paymentIntentId: 'pi_1' }));
    const retryRow = row({
      id: 'pay-2',
      stripe_payment_intent_id: 'pi_2',
      created_at: new Date(STARTED + 40_000).toISOString(),
    });
    expect(isKnownFailedCardRow(retryRow)).toBe(false);
  });

  it('ignores amount and booking once an intent is present', () => {
    // A row naming OUR intent is ours even if the amount was later corrected.
    recordFailedCardAttempt(attempt({ paymentIntentId: 'pi_1', amountPence: 2500 }));
    expect(
      isKnownFailedCardRow(row({ stripe_payment_intent_id: 'pi_1', amount_pence: 9999 })),
    ).toBe(true);
  });

  it('still falls back to the window for rows carrying no intent', () => {
    recordFailedCardAttempt(attempt());
    expect(isKnownFailedCardRow(row({ stripe_payment_intent_id: null }))).toBe(true);
    expect(
      isKnownFailedCardRow(
        row({
          stripe_payment_intent_id: '   ',
          created_at: new Date(STARTED + ATTEMPT_MATCH_SKEW_MS + 1_000).toISOString(),
        }),
      ),
    ).toBe(false);
  });
});
