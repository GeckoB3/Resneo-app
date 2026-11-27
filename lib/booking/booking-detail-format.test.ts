import {
  formatBookingDateLabel,
  formatBookingTimeRange,
  formatGuestName,
  formatShortDate,
  historyRowAppointment,
  TERMINAL_STATUSES,
} from '@/lib/booking/booking-detail-format';
import type { BookingDetail } from '@/types/booking-detail';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';

describe('formatGuestName', () => {
  it('joins the names it has', () => {
    expect(formatGuestName({ guest: { first_name: 'Sam', last_name: 'Lee' } } as BookingDetail)).toBe('Sam Lee');
    expect(formatGuestName({ guest: { first_name: 'Sam', last_name: null } } as unknown as BookingDetail)).toBe('Sam');
  });

  it('says Client with no name', () => {
    expect(formatGuestName({ guest: null } as unknown as BookingDetail)).toBe('Client');
    expect(formatGuestName({ guest: { first_name: '', last_name: '' } } as BookingDetail)).toBe('Client');
  });
});

describe('formatBookingDateLabel', () => {
  it('reads the day headline-style', () => {
    expect(formatBookingDateLabel('2026-11-27', '10:00:00')).toBe('Friday 27 November');
  });

  it('falls back to the raw date', () => {
    expect(formatBookingDateLabel('not a date', '10:00')).toBe('not a date');
  });
});

describe('formatBookingTimeRange', () => {
  it('uses the stored end', () => {
    expect(formatBookingTimeRange('14:00:00', '15:00:00')).toBe('14:00 – 15:00');
  });

  it('adds the length when there is no end, wrapping past midnight', () => {
    expect(formatBookingTimeRange('14:00', null, 45)).toBe('14:00 – 14:45');
    expect(formatBookingTimeRange('23:30', null, 60)).toBe('23:30 – 00:30');
  });

  it('is the bare start when nothing gives an end', () => {
    expect(formatBookingTimeRange('14:00', null, null)).toBe('14:00');
  });
});

describe('formatShortDate', () => {
  it('reads a short date, or gives the value back', () => {
    expect(formatShortDate('2026-11-27')).toBe('27 Nov 2026');
    expect(formatShortDate('soon')).toBe('soon');
  });
});

describe('historyRowAppointment', () => {
  it('rebooks an appointment with its person and service', () => {
    expect(
      historyRowAppointment({
        calendar_id: 'cal-1',
        service_item_id: 's1',
        service_variant_id: 'v1',
      } as unknown as GuestBookingHistoryRow),
    ).toEqual({ serviceId: 's1', practitionerId: 'cal-1', variantId: 'v1' });
  });

  it('is null for a row that is not a repeatable appointment', () => {
    expect(historyRowAppointment({ practitioner_id: 'cal-1' } as unknown as GuestBookingHistoryRow)).toBeNull();
  });
});

describe('TERMINAL_STATUSES', () => {
  it('holds the finished statuses', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['Cancelled', 'Completed', 'No-Show']);
  });
});
