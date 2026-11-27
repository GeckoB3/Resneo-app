/**
 * The visit and group Review lines (web live round 27 Nov 2026): a visit's add-on shows under its
 * service; a group's Review has a Date row, "3:00pm" times, and no deposit line until ticked.
 */
import { formatBookingDate } from '@/lib/booking/booking-format';
import type { BookingQuote } from '@/lib/booking/booking-quote';
import { groupChargeNowPence, groupReviewLines, visitSegmentAddonLine } from '@/lib/booking/review-lines';

function quote(over: Partial<BookingQuote['deposit']> = {}, addonsPence = 1500): BookingQuote {
  return {
    quote_version: 1,
    mode: 'visit',
    cancellation_notice_hours: 48,
    card_payments_available: true,
    items: [
      {
        index: 0,
        service_id: 'hair-up',
        calendar_id: 'sophie',
        date: '2026-12-09',
        start: '15:45',
        end: '16:45',
        duration_minutes: 60,
        buffer_minutes: 0,
        processing_tail_minutes: 0,
        estimated_end_time: null,
        price: { service_pence: 5500, addons_pence: addonsPence, total_pence: 5500 + addonsPence },
        charge: { kind: 'none', amount_pence: 0, card_hold_fee_pence: null, offered_kind: 'deposit', offered_amount_pence: 2000, card_hold_percent: null },
      },
    ],
    totals: { price_pence: 10500, duration_minutes: 125, starts_at: '15:45', ends_at: '17:50', charge_now_pence: 0, offered_charge_pence: 2000, card_hold_fee_pence: 0 },
    deposit: {
      required: false,
      amount_pence: 0,
      offered_amount_pence: 1500,
      word: 'deposit',
      cancel_choice: true,
      deadline_text: null,
      cancel_label: null,
      kept: null,
      cancel_at: null,
      outcome_line: null,
      ...over,
    },
    card_hold: { required: false, fee_pence: 0, consent_text: null, percent: null, percent_label: null },
  };
}

describe('visitSegmentAddonLine', () => {
  const hairUp = { serviceId: 'hair-up', addonIds: ['opt-2'], addonNames: ['Option 2'], addonTotalPence: 1000 };

  it("shows the add-on's name and the quote's add-on price for that service", () => {
    expect(visitSegmentAddonLine(hairUp, 0, quote())).toEqual({ label: 'Option 2', pence: 1500 });
  });

  it('falls back to the price worked out locally without a quote, or one for another service', () => {
    expect(visitSegmentAddonLine(hairUp, 0, null)).toEqual({ label: 'Option 2', pence: 1000 });
    expect(visitSegmentAddonLine({ ...hairUp, serviceId: 'other' }, 0, quote())).toEqual({ label: 'Option 2', pence: 1000 });
  });

  it('is null for a service without add-ons', () => {
    expect(visitSegmentAddonLine({ serviceId: 'olaplex' }, 1, quote())).toBeNull();
  });
});

describe('groupReviewLines', () => {
  it('one day: a Date row and 12-hour times, as the single Review', () => {
    const lines = groupReviewLines([
      { bookingDate: '2026-12-07', bookingTime: '16:00:00' },
      { bookingDate: '2026-12-07', bookingTime: '09:30' },
    ]);
    // The single Review's own date format.
    expect(lines).toEqual({ dateLabel: formatBookingDate('2026-12-07'), times: ['4:00pm', '9:30am'] });
    expect(lines.dateLabel).toContain('7 December 2026');
  });

  it('across days: each time carries its day', () => {
    const lines = groupReviewLines([
      { bookingDate: '2026-12-07', bookingTime: '16:00' },
      { bookingDate: '2026-12-08', bookingTime: '10:00' },
    ]);
    expect(lines.dateLabel).toBeNull();
    expect(lines.times).toEqual(['Mon 7 Dec, 4:00pm', 'Tue 8 Dec, 10:00am']);
  });
});

describe('groupChargeNowPence', () => {
  it('is nothing until Require deposit is ticked, though the quote offers one', () => {
    expect(groupChargeNowPence({ offeredPence: 1500, requireDeposit: false, showChargeCheckbox: true, quote: quote() })).toBe(0);
  });

  it("ticked: the quote's charge, else what ticking offers", () => {
    expect(
      groupChargeNowPence({ offeredPence: 1500, requireDeposit: true, showChargeCheckbox: true, quote: quote({ required: true, amount_pence: 1500 }) }),
    ).toBe(1500);
    expect(groupChargeNowPence({ offeredPence: 1500, requireDeposit: true, showChargeCheckbox: true, quote: null })).toBe(1500);
  });

  it('is nothing for a walk-in, which has no charge choice', () => {
    expect(groupChargeNowPence({ offeredPence: 1500, requireDeposit: true, showChargeCheckbox: false, quote: null })).toBe(0);
  });
});
