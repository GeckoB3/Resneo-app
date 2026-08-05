import {
  MAX_IN_PERSON_PENCE,
  bookingPaymentStateLabel,
  buildPaymentHistory,
  buildPriceSummary,
  canRefundInPerson,
  canTakeInPersonPayment,
  checkChargeAmount,
  otherVisitLineNote,
  paymentMethodLabel,
  pendingCardPayments,
  pendingCardState,
  pendingCardTotalPence,
  PENDING_CARD_STALE_MS,
  refundablePayments,
  remainingAfterPayment,
  visitPaymentNote,
} from '@/lib/payments/payment-display';
import type { BookingDetail, BookingPaymentRow, VisitPayment } from '@/types/booking-detail';

/**
 * §3.4 Take-payment gate + neutral state labels (Tap to Pay design doc).
 * The gate is the enforcement point for "frictionless & optional": the button
 * must simply not exist in every off case.
 */

const BASE = {
  inPersonPaymentsEnabled: true,
  isAppointmentVenue: true,
  status: 'Booked',
  paymentState: 'deposit_paid' as const,
  balanceDuePence: 2500,
};

describe('canTakeInPersonPayment (§3.4 rule 2)', () => {
  it('shows for an enabled appointments venue with an outstanding balance', () => {
    expect(canTakeInPersonPayment(BASE)).toBe(true);
  });

  it('hides when the venue flag is off (frictionless off)', () => {
    expect(canTakeInPersonPayment({ ...BASE, inPersonPaymentsEnabled: false })).toBe(false);
  });

  it('hides for non-appointment venues', () => {
    expect(canTakeInPersonPayment({ ...BASE, isAppointmentVenue: false })).toBe(false);
  });

  it('hides on cancelled bookings only; other statuses never gate it', () => {
    expect(canTakeInPersonPayment({ ...BASE, status: 'Cancelled' })).toBe(false);
    for (const status of ['Pending', 'Booked', 'Confirmed', 'Seated', 'Completed', 'No-Show']) {
      expect(canTakeInPersonPayment({ ...BASE, status })).toBe(true);
    }
  });

  it('hides when already paid or refunded', () => {
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'paid' })).toBe(false);
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'refunded' })).toBe(false);
  });

  it('unpaid / partially_paid / missing state stay actionable', () => {
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'unpaid' })).toBe(true);
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'partially_paid' })).toBe(true);
    expect(canTakeInPersonPayment({ ...BASE, paymentState: null })).toBe(true);
  });

  it('hides at zero balance; shows when the balance is unknown (null → staff enter the amount)', () => {
    expect(canTakeInPersonPayment({ ...BASE, balanceDuePence: 0 })).toBe(false);
    expect(canTakeInPersonPayment({ ...BASE, balanceDuePence: null })).toBe(true);
    expect(canTakeInPersonPayment({ ...BASE, balanceDuePence: undefined })).toBe(true);
  });
});

describe('labels', () => {
  it('maps every payment state to a neutral label', () => {
    expect(bookingPaymentStateLabel('unpaid')).toBe('Unpaid');
    expect(bookingPaymentStateLabel('deposit_paid')).toBe('Deposit paid');
    expect(bookingPaymentStateLabel('partially_paid')).toBe('Partially paid');
    expect(bookingPaymentStateLabel('paid')).toBe('Paid');
    expect(bookingPaymentStateLabel('refunded')).toBe('Refunded');
  });

  it('maps ledger methods to short labels', () => {
    expect(paymentMethodLabel('card_present')).toBe('Card');
    expect(paymentMethodLabel('cash')).toBe('Cash');
    expect(paymentMethodLabel('external')).toBe('Other');
    expect(paymentMethodLabel('online')).toBe('Online');
  });
});

describe('refundablePayments', () => {
  const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
    id: 'p1',
    method: 'card_present',
    status: 'succeeded',
    amount_pence: 2500,
    note: null,
    created_at: '2026-07-23T10:00:00Z',
    ...over,
  });

  it('keeps only succeeded rows (any method)', () => {
    const rows = [
      row({ id: 'a', status: 'succeeded', method: 'card_present' }),
      row({ id: 'b', status: 'succeeded', method: 'cash' }),
      row({ id: 'c', status: 'pending' }),
      row({ id: 'd', status: 'failed' }),
      row({ id: 'e', status: 'refunded' }),
    ];
    expect(refundablePayments(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('tolerates a missing list', () => {
    expect(refundablePayments(undefined)).toEqual([]);
    expect(refundablePayments(null)).toEqual([]);
  });
});

describe('pendingCardPayments', () => {
  const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
    id: 'p1',
    method: 'card_present',
    status: 'pending',
    amount_pence: 2500,
    note: null,
    created_at: '2026-07-23T10:00:00Z',
    ...over,
  });

  it('keeps only card rows still waiting on their webhook', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', status: 'succeeded' }),
      // Cash/external are written `succeeded` synchronously, so a pending one
      // is not a card payment in flight and must not raise the warning.
      row({ id: 'c', method: 'cash' }),
      row({ id: 'd', method: 'online' }),
    ];
    expect(pendingCardPayments(rows).map((r) => r.id)).toEqual(['a']);
  });

  it('totals what is in flight, and tolerates a missing list', () => {
    expect(pendingCardTotalPence([row({ id: 'a' }), row({ id: 'b', amount_pence: 1500 })])).toBe(
      4000,
    );
    expect(pendingCardTotalPence(undefined)).toBe(0);
    expect(pendingCardPayments(null)).toEqual([]);
  });
});

describe('checkChargeAmount', () => {
  it('treats a blank field as "take the whole balance"', () => {
    // Omitting amount_pence is what asks the server for the full balance.
    expect(checkChargeAmount('', 3000)).toEqual({
      amountPence: null,
      valid: true,
      error: null,
    });
  });

  it('blocks a blank field when the price is unknown, without nagging', () => {
    // The buttons are simply disabled; an untouched field is not an error.
    expect(checkChargeAmount('', null)).toEqual({
      amountPence: null,
      valid: false,
      error: null,
    });
  });

  it('passes a partial amount straight through', () => {
    expect(checkChargeAmount('20', 9000)).toEqual({
      amountPence: 2000,
      valid: true,
      error: null,
    });
  });

  it('rejects nonsense and zero', () => {
    expect(checkChargeAmount('abc', 3000).valid).toBe(false);
    expect(checkChargeAmount('abc', 3000).error).toBe('Enter a valid amount.');
    expect(checkChargeAmount('0', 3000).error).toBe('Enter an amount greater than zero.');
    expect(checkChargeAmount('-5', 3000).error).toBe('Enter a valid amount.');
  });

  it('blocks more than the balance instead of letting the route clamp it', () => {
    // charge/route.ts: Math.min(input.amount_pence ?? balance, balance). £100
    // against a £30 balance silently records £30, which on the cash path means
    // the till holds £50 in notes and the ledger says £30.
    const result = checkChargeAmount('100', 3000);
    expect(result.valid).toBe(false);
    expect(result.amountPence).toBeNull();
    expect(result.error).toBe('That is more than the £30.00 outstanding. Enter £30.00 or less.');
  });

  it('allows exactly the balance', () => {
    expect(checkChargeAmount('30.00', 3000)).toEqual({
      amountPence: 3000,
      valid: true,
      error: null,
    });
  });

  it('explains the £1,000 cap rather than letting the route 400 "Invalid request"', () => {
    // The zod schema caps amount_pence, so anything above fails schema parse and
    // comes back as a bare 400 that tells staff nothing.
    const result = checkChargeAmount('1200', null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'The most you can take in one payment is £1,000.00. Take the rest as a second payment.',
    );
  });

  it('holds the cap boundary exactly', () => {
    expect(checkChargeAmount('1000.00', null).amountPence).toBe(MAX_IN_PERSON_PENCE);
    expect(checkChargeAmount('1000.00', null).valid).toBe(true);
    expect(checkChargeAmount('1000.01', null).valid).toBe(false);
  });

  it('still collects a genuine over-cap balance in one go', () => {
    // The cap only applies to a SUPPLIED amount_pence, so taking the whole
    // balance omits it and the server charges the figure it resolved itself.
    expect(checkChargeAmount('1200.00', 120_000)).toEqual({
      amountPence: null,
      valid: true,
      error: null,
    });
    // A part payment of that balance is still capped — the route would reject it.
    expect(checkChargeAmount('1100.00', 120_000).valid).toBe(false);
  });

  it('reports over-balance before the cap, because that is the more useful message', () => {
    expect(checkChargeAmount('1200', 3000).error).toContain('£30.00 outstanding');
  });
});

describe('remainingAfterPayment', () => {
  it('reports what is left after a part payment', () => {
    expect(remainingAfterPayment(9000, 2000)).toBe(7000);
  });

  it('never goes negative, and says nothing when either figure is unknown', () => {
    expect(remainingAfterPayment(2000, 9000)).toBe(0);
    expect(remainingAfterPayment(null, 2000)).toBeNull();
    expect(remainingAfterPayment(2000, null)).toBeNull();
  });
});

describe('buildPaymentHistory', () => {
  const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
    id: 'p1',
    booking_id: 'bk-1',
    method: 'card_present',
    status: 'succeeded',
    amount_pence: 2500,
    note: null,
    created_at: '2026-07-23T10:00:00Z',
    ...over,
  });

  it('lists every row newest first, including pending and failed ones', () => {
    // A failed or still-processing attempt is precisely what staff need when
    // something goes wrong; hiding it left the booking looking simply unpaid.
    const rows = buildPaymentHistory(
      [
        row({ id: 'a', created_at: '2026-07-23T09:00:00Z', status: 'failed' }),
        row({ id: 'b', created_at: '2026-07-23T11:00:00Z', status: 'pending' }),
        row({ id: 'c', created_at: '2026-07-23T10:00:00Z', method: 'cash' }),
        row({ id: 'd', created_at: '2026-07-23T08:00:00Z', status: 'refunded' }),
      ],
      'bk-1',
    );
    expect(rows.map((r) => [r.key, r.statusLabel, r.methodLabel, r.tone])).toEqual([
      ['b', 'Processing', 'Card', 'warning'],
      ['c', 'Collected', 'Cash', 'default'],
      ['a', 'Failed', 'Card', 'danger'],
      ['d', 'Refunded', 'Card', 'muted'],
    ]);
  });

  it("labels a row collected on another service of the visit (§5.7)", () => {
    const rows = buildPaymentHistory([row({ booking_id: 'bk-2' })], 'bk-1');
    expect(rows[0].note).toBe('Collected on another service in this visit');
    expect(buildPaymentHistory([row({ booking_id: 'bk-1' })], 'bk-1')[0].note).toBeNull();
  });

  it('tolerates a missing list', () => {
    expect(buildPaymentHistory(undefined, 'bk-1')).toEqual([]);
  });
});

describe('buildPriceSummary', () => {
  const booking = (over: Partial<BookingDetail>): BookingDetail =>
    ({
      id: 'bk-1',
      status: 'Booked',
      booking_date: '2026-07-27',
      booking_time: '10:00',
      party_size: 1,
      guest_id: 'g-1',
      ...over,
    }) as BookingDetail;

  function labels(rows: ReturnType<typeof buildPriceSummary>) {
    return rows.map((r) => [r.label, r.pence, r.note ?? null]);
  }

  it('lists the service, each add-on, and the booking total', () => {
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Cut & finish',
        service_variant_price_pence: 3000,
        addons: [
          { addon_id: 'a1', addon_name_snapshot: 'Scalp massage', price_pence_at_booking: 500, duration_minutes_at_booking: 10 },
          { addon_id: 'a2', addon_name_snapshot: 'Gloss', price_pence_at_booking: 800, duration_minutes_at_booking: 15 },
        ],
        addons_total_price_pence: 1300,
        balance_due_pence: 4300,
      }),
    );

    expect(labels(rows)).toEqual([
      ['Cut & finish', 3000, null],
      ['Scalp massage', 500, null],
      ['Gloss', 800, null],
      ['Booking total', 4300, null],
      ['Outstanding', 4300, null],
    ]);
  });

  it('resolves the total from variant + add-ons when the stored column is empty', () => {
    // booking_total_price_pence is NULL for app/widget/staff-created appointments
    // (backend §5.7), so the total must not depend on it.
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Massage',
        service_variant_price_pence: 4000,
        addons_total_price_pence: 1000,
        booking_total_price_pence: null,
        balance_due_pence: 5000,
      }),
    );
    expect(rows.find((r) => r.label === 'Booking total')?.pence).toBe(5000);
  });

  it('names an unpriced service instead of hiding it', () => {
    // Otherwise a £0 variant looks like a broken screen: no prices, and a Take
    // payment sheet that demands a typed amount for no visible reason.
    const rows = buildPriceSummary(
      booking({ service_variant_name: 'Consultation', service_variant_price_pence: null }),
    );
    expect(labels(rows)).toEqual([['Consultation', null, 'Price not set']]);
  });

  it('shows the visit total for a multi-service visit', () => {
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Colour',
        service_variant_price_pence: 6000,
        visit_payment: {
          booking_count: 2,
          booking_ids: ['bk-1', 'bk-2'],
          total_pence: 9000,
          amount_paid_pence: 0,
          balance_due_pence: 9000,
        },
        balance_due_pence: 9000,
      }),
    );
    expect(rows.find((r) => r.label === 'Visit total (2 services)')?.pence).toBe(9000);
  });

  it('lists every service of a visit with its own price', () => {
    const rows = buildPriceSummary(
      booking({
        id: 'bk-1',
        service_variant_name: 'Cut & finish',
        service_variant_price_pence: 3000,
        addons: [
          { addon_id: 'a1', addon_name_snapshot: 'Gloss', price_pence_at_booking: 800, duration_minutes_at_booking: 15 },
        ],
        addons_total_price_pence: 800,
        visit_payment: {
          booking_count: 2,
          booking_ids: ['bk-1', 'bk-2'],
          total_pence: 10300,
          amount_paid_pence: 0,
          balance_due_pence: 10300,
          lines: [
            { booking_id: 'bk-1', name: 'Cut & finish', total_pence: 3800 },
            { booking_id: 'bk-2', name: 'Colour', total_pence: 6500 },
          ],
        },
        balance_due_pence: 10300,
      }),
    );

    // Per-line totals already include each line's add-ons, so this booking's own
    // add-on row and "Booking total" must not also appear.
    expect(labels(rows)).toEqual([
      ['Cut & finish', 3800, null],
      ['Colour', 6500, null],
      ['Visit total (2 services)', 10300, null],
      ['Outstanding', 10300, null],
    ]);
  });

  it('falls back to the on-screen service name when a visit line has none', () => {
    const rows = buildPriceSummary(
      booking({
        id: 'bk-1',
        service_variant_name: 'Cut & finish',
        service_variant_price_pence: 3000,
        visit_payment: {
          booking_count: 2,
          booking_ids: ['bk-1', 'bk-2'],
          total_pence: 9500,
          amount_paid_pence: 0,
          balance_due_pence: 9500,
          lines: [
            { booking_id: 'bk-1', name: null, total_pence: 3000 },
            { booking_id: 'bk-2', name: null, total_pence: 6500 },
          ],
        },
        balance_due_pence: 9500,
      }),
    );
    expect(rows.slice(0, 2).map((r) => r.label)).toEqual(['Cut & finish', 'Service']);
  });

  it('keeps the single-booking breakdown when an older payload has no visit lines', () => {
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Colour',
        service_variant_price_pence: 6000,
        visit_payment: {
          booking_count: 2,
          booking_ids: ['bk-1', 'bk-2'],
          total_pence: 9000,
          amount_paid_pence: 0,
          balance_due_pence: 9000,
        },
        balance_due_pence: 9000,
      }),
    );
    expect(rows.map((r) => r.label)).toEqual([
      'Colour',
      'Visit total (2 services)',
      'Outstanding',
    ]);
  });

  it('reports a paid deposit without double-counting it as paid-so-far', () => {
    // amount_paid_pence already includes the deposit, so showing both as
    // deductions would understate what is owed.
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Facial',
        service_variant_price_pence: 5000,
        deposit_status: 'Paid',
        deposit_amount_pence: 1000,
        amount_paid_pence: 1000,
        balance_due_pence: 4000,
      }),
    );
    expect(labels(rows)).toEqual([
      ['Facial', 5000, null],
      ['Deposit paid', 1000, null],
      ['Outstanding', 4000, null],
    ]);
  });

  it('shows paid-so-far when in-person payments went on top of the deposit', () => {
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Facial',
        service_variant_price_pence: 5000,
        deposit_status: 'Paid',
        deposit_amount_pence: 1000,
        amount_paid_pence: 3000,
        balance_due_pence: 2000,
      }),
    );
    expect(rows.map((r) => r.label)).toEqual([
      'Facial',
      'Deposit paid',
      'Paid so far',
      'Outstanding',
    ]);
  });

  it('explains an unknown balance rather than showing a dash', () => {
    const rows = buildPriceSummary(
      booking({
        service_variant_name: 'Package',
        service_variant_price_pence: 5000,
        balance_due_pence: null,
      }),
    );
    expect(rows.find((r) => r.label === 'Outstanding')?.note).toBe('Enter an amount');
  });

  it('renders nothing for a booking with no prices, deposit or payments', () => {
    expect(buildPriceSummary(booking({}))).toEqual([]);
  });
});

describe('otherVisitLineNote (§5.7)', () => {
  const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
    id: 'p1',
    method: 'card_present',
    status: 'succeeded',
    amount_pence: 2500,
    note: null,
    created_at: '2026-07-23T10:00:00Z',
    ...over,
  });

  it('flags a row collected on another service of the visit', () => {
    // payments[] is visit-wide, so the opened line lists a sibling's payment
    // with no other clue that it belongs elsewhere.
    expect(otherVisitLineNote(row({ booking_id: 'bk-2' }), 'bk-1')).toBe(
      'Collected on another service in this visit',
    );
  });

  it('says nothing for a row anchored to the booking on screen', () => {
    expect(otherVisitLineNote(row({ booking_id: 'bk-1' }), 'bk-1')).toBeNull();
  });

  it('tolerates an older payload with no booking_id', () => {
    expect(otherVisitLineNote(row({}), 'bk-1')).toBeNull();
  });
});

describe('visitPaymentNote (§5.7)', () => {
  const visit = (over: Partial<VisitPayment>): VisitPayment => ({
    booking_count: 2,
    booking_ids: ['b1', 'b2'],
    total_pence: 9000,
    amount_paid_pence: 1000,
    balance_due_pence: 8000,
    ...over,
  });

  it('explains that the balance covers every service in the visit', () => {
    // Without this, staff opening a £30 service and seeing "£90.00 due" have
    // no way to tell whether the amount is right.
    expect(visitPaymentNote(visit({ booking_count: 2 }))).toBe(
      'Covers all 2 services in this visit',
    );
    expect(visitPaymentNote(visit({ booking_count: 3 }))).toBe(
      'Covers all 3 services in this visit',
    );
  });

  it('says nothing for a standalone appointment', () => {
    expect(visitPaymentNote(visit({ booking_count: 1 }))).toBeNull();
    expect(visitPaymentNote(visit({ booking_count: 0 }))).toBeNull();
  });

  it('tolerates an older payload with no visit block', () => {
    expect(visitPaymentNote(undefined)).toBeNull();
    expect(visitPaymentNote(null)).toBeNull();
  });
});

describe('pendingCardState (how loud a pending card row is allowed to be)', () => {
  const NOW = Date.parse('2026-07-29T12:00:00Z');
  const pending = (over: Partial<BookingPaymentRow> = {}): BookingPaymentRow => ({
    id: 'pay-1',
    booking_id: 'bk-1',
    method: 'card_present',
    status: 'pending',
    amount_pence: 2500,
    note: null,
    created_at: new Date(NOW - 3_000).toISOString(),
    ...over,
  });

  it('says there is nothing to warn about when nothing is pending', () => {
    expect(pendingCardState({ payments: [], nowMs: NOW, knownFailed: [] }).verdict).toBe('none');
    expect(pendingCardState({ payments: null, nowMs: NOW, knownFailed: [] }).verdict).toBe('none');
  });

  it('blocks on a fresh row, with the total to show staff', () => {
    const state = pendingCardState({
      payments: [pending(), pending({ id: 'pay-2', amount_pence: 1000 })],
      nowMs: NOW,
      knownFailed: [],
    });
    expect(state.verdict).toBe('in_flight');
    expect(state.totalPence).toBe(3500);
    expect(state.rows).toHaveLength(2);
  });

  it('softens a row whose webhook is clearly never coming', () => {
    /**
     * Nothing in the app can settle a stuck `pending` row, so a permanent hard
     * gate would leave the venue unable to take money at all. Past the settlement
     * window it becomes information.
     */
    const stale = pending({
      created_at: new Date(NOW - PENDING_CARD_STALE_MS - 1_000).toISOString(),
    });
    expect(pendingCardState({ payments: [stale], nowMs: NOW, knownFailed: [] }).verdict).toBe(
      'stale',
    );
  });

  it('stays blocking right up to the edge of the window', () => {
    const edge = pending({
      created_at: new Date(NOW - PENDING_CARD_STALE_MS + 1_000).toISOString(),
    });
    expect(pendingCardState({ payments: [edge], nowMs: NOW, knownFailed: [] }).verdict).toBe(
      'in_flight',
    );
  });

  it('assumes in flight until the clock has actually been read', () => {
    // `nowMs` is 0 on the first render, before the effect that reads the clock.
    // Warning for a moment too long is free; missing a warning is a double charge.
    const old = pending({ created_at: '2020-01-01T00:00:00Z' });
    expect(pendingCardState({ payments: [old], nowMs: 0, knownFailed: [] }).verdict).toBe(
      'in_flight',
    );
  });

  it('assumes in flight when the row has no readable timestamp', () => {
    expect(
      pendingCardState({ payments: [pending({ created_at: 'nonsense' })], nowMs: NOW, knownFailed: [] })
        .verdict,
    ).toBe('in_flight');
  });

  it('discounts an attempt this client watched decline', () => {
    // The device bug: the row stays `pending` until the payment_failed webhook
    // lands (in dev, possibly never), so staff were warned about a payment they
    // had just seen refused.
    const state = pendingCardState({
      payments: [pending()],
      nowMs: NOW,
      knownFailed: [
        {
          bookingId: 'bk-1',
          paymentIntentId: 'pi_1',
          amountPence: 2500,
          startedAtMs: NOW - 10_000,
          failedAtMs: NOW - 1_000,
        },
      ],
    });
    expect(state.verdict).toBe('none');
    expect(state.totalPence).toBe(0);
  });

  it('still counts a row the decline does not account for', () => {
    const state = pendingCardState({
      payments: [pending(), pending({ id: 'pay-2', amount_pence: 4000 })],
      nowMs: NOW,
      knownFailed: [
        {
          bookingId: 'bk-1',
          paymentIntentId: 'pi_1',
          amountPence: 2500,
          startedAtMs: NOW - 10_000,
          failedAtMs: NOW - 1_000,
        },
      ],
    });
    expect(state.verdict).toBe('in_flight');
    expect(state.totalPence).toBe(4000);
  });

  it('leaves the raw ledger helpers alone, so history still shows the row', () => {
    // Staff need the Processing -> Failed trail for reconciliation; only the
    // gate and the notices discount it.
    expect(pendingCardPayments([pending()])).toHaveLength(1);
    expect(pendingCardTotalPence([pending()])).toBe(2500);
  });
});

describe('canRefundInPerson', () => {
  const paid = {
    id: 'pay-1',
    method: 'card_present' as const,
    status: 'succeeded' as const,
    amount_pence: 2500,
    note: null,
    created_at: '2026-08-05T10:00:00Z',
  };
  const base = {
    inPersonPaymentsEnabled: true,
    isAppointmentVenue: true,
    isAdmin: true,
    payments: [paid],
  };

  it('offers the refund when an admin has a settled row to act on', () => {
    expect(canRefundInPerson(base)).toBe(true);
  });

  it('is off for non-admins — refunds follow every other money action', () => {
    expect(canRefundInPerson({ ...base, isAdmin: false })).toBe(false);
  });

  it('is off when the venue switch is off, because the server 403s refunds too', () => {
    expect(canRefundInPerson({ ...base, inPersonPaymentsEnabled: false })).toBe(false);
    expect(canRefundInPerson({ ...base, inPersonPaymentsEnabled: null })).toBe(false);
  });

  it('needs a succeeded row: pending and failed ones are not refundable', () => {
    expect(canRefundInPerson({ ...base, payments: [] })).toBe(false);
    expect(canRefundInPerson({ ...base, payments: null })).toBe(false);
    expect(canRefundInPerson({ ...base, payments: [{ ...paid, status: 'pending' }] })).toBe(false);
    expect(canRefundInPerson({ ...base, payments: [{ ...paid, status: 'failed' }] })).toBe(false);
  });

  it('stays available where taking a payment is not — that is the point', () => {
    // canTakeInPersonPayment is false for both of these; a refund is exactly
    // what a settled or cancelled booking needs.
    expect(canRefundInPerson(base)).toBe(true);
    expect(
      canTakeInPersonPayment({
        inPersonPaymentsEnabled: true,
        isAppointmentVenue: true,
        status: 'Completed',
        paymentState: 'paid',
        balanceDuePence: 0,
      }),
    ).toBe(false);
  });
});
