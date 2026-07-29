import {
  SETTLEMENT_POLL_DELAYS_MS,
  SETTLEMENT_WATCH_MAX_AGE_MS,
  settlementWatch,
} from '@/lib/payments/settlement-watch';
import type { BookingPaymentRow } from '@/types/booking-detail';

/**
 * The webhook, not `confirmPaymentIntent`, decides when a card payment is
 * settled — so the app has to keep looking for a second or three afterwards.
 * These pin what it waits on, and just as importantly what it refuses to wait on.
 */

const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
  id: 'p1',
  method: 'card_present',
  status: 'pending',
  amount_pence: 2500,
  note: null,
  created_at: '2026-07-23T10:00:00Z',
  ...over,
});

describe('settlementWatch', () => {
  it('waits on a pending card row', () => {
    expect(settlementWatch([row({ id: 'a' })])?.key).toBe('a');
  });

  it('waits on nothing once the row settles', () => {
    expect(settlementWatch([row({ status: 'succeeded' })])).toBeNull();
    expect(settlementWatch([row({ status: 'failed' })])).toBeNull();
    expect(settlementWatch([])).toBeNull();
    expect(settlementWatch(undefined)).toBeNull();
  });

  it('never waits on cash or external, which the route writes synchronously', () => {
    expect(settlementWatch([row({ method: 'cash' }), row({ method: 'external' })])).toBeNull();
  });

  it('keys stably regardless of row order, so one backoff chain keeps running', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    expect(settlementWatch([a, b])?.key).toBe(settlementWatch([b, a])?.key);
    expect(settlementWatch([a, b])?.key).toBe('a,b');
  });

  it('reports the newest attempt as the start, so a retry restarts the clock', () => {
    const watch = settlementWatch([
      row({ id: 'a', created_at: '2026-07-23T10:00:00Z' }),
      row({ id: 'b', created_at: '2026-07-23T10:05:00Z' }),
    ]);
    expect(watch?.startedAtMs).toBe(Date.parse('2026-07-23T10:05:00Z'));
  });

  it('reports NaN for an unparseable timestamp, which fails every age check', () => {
    // NaN comparisons are always false, so the caller's `now - startedAtMs >
    // MAX` gate never ages the row out: a few seconds of polling is much
    // cheaper than showing a paid booking as unpaid. One bad row poisons the
    // reduce deliberately, so a mixed batch is not silently judged by its
    // readable half.
    expect(Number.isNaN(settlementWatch([row({ created_at: 'not a date' })])!.startedAtMs)).toBe(
      true,
    );
    expect(
      Number.isNaN(
        settlementWatch([
          row({ id: 'a', created_at: '2026-07-23T10:00:00Z' }),
          row({ id: 'b', created_at: 'not a date' }),
        ])!.startedAtMs,
      ),
    ).toBe(true);
  });

  it('exposes an age window for the caller to gate on', () => {
    // The gate itself lives in useBookingDetail (reading the clock in render is
    // impure) and is covered there by "ignores a pending row too old to still
    // be in flight". All this module owes it is a sane window.
    expect(SETTLEMENT_WATCH_MAX_AGE_MS).toBeGreaterThan(SETTLEMENT_POLL_DELAYS_MS.at(-1)!);
  });
});

describe('SETTLEMENT_POLL_DELAYS_MS', () => {
  it('is finite and front-loaded to the webhook latency', () => {
    // A webhook that never arrives must leave the app idle showing the pending
    // row, not polling the API for the rest of the shift.
    expect(SETTLEMENT_POLL_DELAYS_MS).toEqual([2_000, 5_000, 10_000]);
  });
});
