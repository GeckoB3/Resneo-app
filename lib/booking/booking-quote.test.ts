/**
 * The server's booking quote (web codebase standards plan P4.2, P4.3): read only with
 * `quote_version`, its figures laid over the visit's segments and the group's people, and nothing
 * changed when there is no quote (the fallback to the local rules).
 */
import {
  applyQuoteToGroupPeople,
  applyQuoteToSegments,
  BOOKING_QUOTE_VERSION,
  groupQuoteItems,
  parseBookingQuote,
  quoteClient,
  quoteDepositOutcome,
  quoteOfferedCharge,
  visitQuoteItems,
  type BookingQuote,
  type BookingQuoteItem,
} from '@/lib/booking/booking-quote';
import { buildMultiServicePayload, type GroupPerson, type MultiServiceSegment } from '@/lib/booking/multi-service-chain';

function item(over: Partial<BookingQuoteItem> = {}): BookingQuoteItem {
  return {
    index: 0,
    service_id: 'svc-cut',
    calendar_id: 'cal-1',
    date: '2026-12-15',
    start: '10:00',
    end: '10:30',
    duration_minutes: 30,
    buffer_minutes: 0,
    processing_tail_minutes: 0,
    estimated_end_time: '2026-12-15T10:30:00.000Z',
    price: { service_pence: 3000, addons_pence: 0, total_pence: 3000 },
    charge: {
      kind: 'none',
      amount_pence: 0,
      card_hold_fee_pence: null,
      offered_kind: 'none',
      offered_amount_pence: 0,
      card_hold_percent: null,
    },
    ...over,
  };
}

function quoteOf(items: BookingQuoteItem[], over: Partial<BookingQuote> = {}): BookingQuote {
  return {
    quote_version: 1,
    mode: items.length > 1 ? 'visit' : 'single',
    cancellation_notice_hours: 24,
    card_payments_available: true,
    items,
    totals: {
      price_pence: items.reduce((s, i) => s + i.price.total_pence, 0),
      duration_minutes: items.reduce((s, i) => s + i.duration_minutes, 0),
      starts_at: items[0]!.start,
      ends_at: items[items.length - 1]!.end,
      charge_now_pence: 0,
      offered_charge_pence: 0,
      card_hold_fee_pence: 0,
    },
    deposit: {
      required: false,
      amount_pence: 0,
      offered_amount_pence: 0,
      word: 'deposit',
      cancel_choice: false,
      deadline_text: null,
      cancel_label: null,
      kept: null,
      cancel_at: null,
      outcome_line: null,
    },
    card_hold: { required: false, fee_pence: 0, consent_text: null, percent: null, percent_label: null },
    ...over,
  };
}

const segment = (over: Partial<MultiServiceSegment> = {}): MultiServiceSegment => ({
  serviceId: 'svc-cut',
  serviceName: 'Cut',
  practitionerId: 'cal-1',
  practitionerName: 'Anna',
  startTime: '10:00',
  durationMinutes: 30,
  naturalDurationMinutes: 30,
  bufferMinutes: 0,
  pricePence: 3000,
  ...over,
});

describe('parseBookingQuote', () => {
  it('reads a quote that carries quote_version', () => {
    const q = quoteOf([item()]);
    expect(parseBookingQuote(q)).toBe(q);
    expect(BOOKING_QUOTE_VERSION).toBe(1);
  });

  it('falls back (null) without quote_version, or with a shape it cannot use', () => {
    const { quote_version: _omit, ...older } = quoteOf([item()]);
    expect(parseBookingQuote(older)).toBeNull();
    expect(parseBookingQuote({ ...quoteOf([item()]), quote_version: 0 })).toBeNull();
    expect(parseBookingQuote({ ...quoteOf([item()]), items: [{ index: 0 }] })).toBeNull();
    expect(parseBookingQuote({ error: 'Not found' })).toBeNull();
    expect(parseBookingQuote(null)).toBeNull();
  });

  it('falls back when the quote answers for a different number of services', () => {
    expect(parseBookingQuote(quoteOf([item()]), 2)).toBeNull();
  });
});

describe('request builders', () => {
  it('a visit sends what the create sends: option, add-ons and a staff length', () => {
    const items = visitQuoteItems([
      segment({ serviceVariantId: 'var-1', addonIds: ['a1'], addonTotalMinutes: 10, durationMinutes: 55, naturalDurationMinutes: 40 }),
      segment({ serviceId: 'svc-col', startTime: '10:55:00' }),
    ]);
    expect(items).toEqual([
      { service_id: 'svc-cut', variant_id: 'var-1', calendar_id: 'cal-1', start: '10:00', custom_duration_minutes: 45, addon_ids: ['a1'] },
      { service_id: 'svc-col', calendar_id: 'cal-1', start: '10:55' },
    ]);
  });

  it("a group's people each carry their day", () => {
    const people: GroupPerson[] = [
      {
        label: 'Jo',
        serviceId: 'svc-cut',
        serviceName: 'Cut',
        practitionerId: 'cal-1',
        practitionerName: 'Anna',
        bookingDate: '2026-12-15',
        bookingTime: '10:00:00',
        durationMinutes: 30,
        pricePence: 3000,
      },
    ];
    expect(groupQuoteItems(people)).toEqual([{ service_id: 'svc-cut', calendar_id: 'cal-1', start: '10:00', date: '2026-12-15' }]);
  });

  it('who it is for: only what is there', () => {
    expect(quoteClient({ email: ' ', phone: '', guest_id: null })).toBeUndefined();
    expect(quoteClient({ email: 'jo@example.com', phone: '' })).toEqual({ email: 'jo@example.com' });
    expect(quoteClient({ guest_id: 'g1' })).toEqual({ guest_id: 'g1' });
  });
});

describe('applyQuoteToSegments', () => {
  it("lays the server's length, price and charge over each segment", () => {
    const quoted = applyQuoteToSegments(
      [segment(), segment({ serviceId: 'svc-bal', startTime: '10:30', pricePence: 5000, durationMinutes: 45, naturalDurationMinutes: 45 })],
      quoteOf([
        item({ duration_minutes: 40, price: { service_pence: 3200, addons_pence: 0, total_pence: 3200 } }),
        item({
          index: 1,
          service_id: 'svc-bal',
          start: '10:30',
          duration_minutes: 45,
          price: { service_pence: 5000, addons_pence: 1000, total_pence: 6000 },
          charge: {
            kind: 'none',
            amount_pence: 0,
            card_hold_fee_pence: null,
            offered_kind: 'full_payment',
            offered_amount_pence: 6000,
            card_hold_percent: null,
          },
        }),
      ]),
    );
    expect(quoted[0]).toMatchObject({ durationMinutes: 40, naturalDurationMinutes: 40, pricePence: 3200, chargePence: null, chargeLabel: null });
    expect(quoted[1]).toMatchObject({ pricePence: 5000, addonTotalPence: 1000, chargePence: 6000, chargeLabel: 'full_payment' });
  });

  it('keeps a staff length as a staff length, so the create sends the same', () => {
    const custom = segment({ durationMinutes: 50, naturalDurationMinutes: 30 });
    const before = buildMultiServicePayload({
      venueId: 'v1',
      bookingDate: '2026-12-15',
      contact: { first_name: 'Jo', last_name: 'B' },
      source: 'phone',
      segments: [custom, segment({ startTime: '10:50' })],
    });
    const quoted = applyQuoteToSegments(
      [custom, segment({ startTime: '10:50' })],
      quoteOf([item({ duration_minutes: 50 }), item({ index: 1, start: '10:50' })]),
    );
    const after = buildMultiServicePayload({
      venueId: 'v1',
      bookingDate: '2026-12-15',
      contact: { first_name: 'Jo', last_name: 'B' },
      source: 'phone',
      segments: quoted,
    });
    expect(after.services).toEqual(before.services);
  });

  it('changes nothing without a quote, or with one for other services (the fallback)', () => {
    const segs = [segment(), segment({ startTime: '10:30' })];
    expect(applyQuoteToSegments(segs, null)).toBe(segs);
    expect(applyQuoteToSegments(segs, quoteOf([item()]))).toBe(segs);
    expect(applyQuoteToSegments(segs, quoteOf([item({ service_id: 'other' }), item({ index: 1 })]))[0]).toBe(segs[0]);
  });
});

describe('applyQuoteToGroupPeople', () => {
  it("lays the server's figures over each person, and nothing without a quote", () => {
    const people: GroupPerson[] = [
      {
        label: 'Jo',
        serviceId: 'svc-cut',
        serviceName: 'Cut',
        practitionerId: 'cal-1',
        practitionerName: 'Anna',
        bookingDate: '2026-12-15',
        bookingTime: '10:00',
        durationMinutes: 30,
        pricePence: 3000,
      },
    ];
    expect(applyQuoteToGroupPeople(people, null)).toBe(people);
    expect(applyQuoteToGroupPeople(people, quoteOf([item({ duration_minutes: 35, price: { service_pence: 3500, addons_pence: 0, total_pence: 3500 } })]))[0]).toMatchObject({
      durationMinutes: 35,
      pricePence: 3500,
    });
  });
});

describe('deposit from the quote', () => {
  const asked = (over: Partial<BookingQuote['deposit']>) =>
    quoteOf([item()], {
      deposit: {
        required: true,
        amount_pence: 2000,
        offered_amount_pence: 2000,
        word: 'deposit',
        cancel_choice: true,
        deadline_text: 'Wed 2 Dec, 09:00',
        cancel_label: 'Cancel if not paid by Wed 2 Dec, 09:00',
        kept: false,
        cancel_at: '2026-12-02T09:00:00.000Z',
        outcome_line: 'If it is not paid by Wed 2 Dec, 09:00, the booking is cancelled.',
        ...over,
      },
    });

  it('the toggle amount and word', () => {
    expect(quoteOfferedCharge(asked({ word: 'payment', offered_amount_pence: 5000 }))).toEqual({ amountPence: 5000, chargeLabel: 'full_payment' });
  });

  it('waiting until the deadline, or kept', () => {
    expect(quoteDepositOutcome(asked({}))).toEqual({ kept: false, cancelOn: 'Wed 2 Dec, 09:00', word: 'deposit' });
    expect(quoteDepositOutcome(asked({ kept: true, cancel_at: null }))).toEqual({ kept: true, cancelOn: null, word: 'deposit' });
  });

  it('none when nothing is asked for, or the server keeps its older rule', () => {
    expect(quoteDepositOutcome(asked({ required: false }))).toBeNull();
    expect(quoteDepositOutcome(asked({ kept: null, cancel_at: null }))).toBeNull();
  });
});
