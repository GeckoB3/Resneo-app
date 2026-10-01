/**
 * The wire shape and wording behind the pause warning and the refused removal
 * (R44-2, R44-4). Mirrors the web's `calendar-upcoming-bookings.test.ts`.
 */
import { ApiError } from '@/lib/api/client';
import {
  calendarPauseConsequences,
  calendarRemovalRefusal,
  calendarRemoveBlockedAdvice,
  calendarRemoveConfirmMessage,
  calendarUpcomingWhenLabel,
  countedBookingTerm,
  describeUpcomingBookingCount,
  isUpcomingCheckUnsupported,
  parseCalendarUpcomingBookings,
  pluralVenueTerm,
  type CalendarUpcomingBooking,
  type CalendarUpcomingBookings,
} from '@/lib/venue/calendar-upcoming-bookings';

function booking(over: Partial<CalendarUpcomingBooking> = {}): CalendarUpcomingBooking {
  return {
    key: 'b1',
    kind: 'appointment',
    booking_ids: ['b1'],
    booking_date: '2026-11-30',
    booking_time: '10:00',
    end_time: '10:45',
    who: 'Priya Shah',
    what: 'Cut',
    status: 'Booked',
    ...over,
  };
}

function upcoming(bookings: CalendarUpcomingBooking[], total = bookings.length): CalendarUpcomingBookings {
  return { bookings, total, truncated: total > bookings.length };
}

const TERMS = { client: 'Client', booking: 'Appointment' };

describe('parseCalendarUpcomingBookings', () => {
  it('reads the pre-check body', () => {
    expect(
      parseCalendarUpcomingBookings({
        calendar: { id: 'c1', name: 'Marcus', is_active: true },
        upcoming_total: 30,
        upcoming_bookings: [booking()],
        upcoming_truncated: true,
      }),
    ).toEqual({ total: 30, bookings: [booking()], truncated: true });
  });

  it('falls back to the list length when the total is missing', () => {
    expect(parseCalendarUpcomingBookings({ upcoming_bookings: [booking()] })).toEqual({
      total: 1,
      bookings: [booking()],
      truncated: false,
    });
  });

  it.each([null, undefined, 'nope', {}, { upcoming_bookings: 'x' }, { error: 'Not found' }])(
    'returns null for %p',
    (payload) => {
      expect(parseCalendarUpcomingBookings(payload)).toBeNull();
    },
  );
});

describe('calendarRemovalRefusal', () => {
  const body = {
    error: 'Marcus still has 2 upcoming appointments.',
    code: 'CALENDAR_HAS_UPCOMING_BOOKINGS',
    upcoming_total: 2,
    upcoming_bookings: [booking(), booking({ key: 'b2' })],
    upcoming_truncated: false,
  };

  it('reads the list from the 409 the server marks with its code', () => {
    expect(calendarRemovalRefusal(new ApiError(body.error, 409, body))?.total).toBe(2);
  });

  it('is null for a 409 without the code, another status, or a plain error', () => {
    expect(
      calendarRemovalRefusal(new ApiError('Last calendar', 409, { error: 'Last calendar' })),
    ).toBeNull();
    expect(calendarRemovalRefusal(new ApiError(body.error, 500, body))).toBeNull();
    expect(calendarRemovalRefusal(new Error('offline'))).toBeNull();
  });

  it('is null when the coded refusal carries no list to show', () => {
    expect(
      calendarRemovalRefusal(
        new ApiError('x', 409, { code: 'CALENDAR_HAS_UPCOMING_BOOKINGS', error: 'x' }),
      ),
    ).toBeNull();
  });
});

describe('isUpcomingCheckUnsupported', () => {
  it('is true only for a 404: a server that has no such check', () => {
    expect(isUpcomingCheckUnsupported(new ApiError('Not found', 404))).toBe(true);
    expect(isUpcomingCheckUnsupported(new ApiError('Forbidden', 403))).toBe(false);
    expect(isUpcomingCheckUnsupported(new ApiError('Timed out', 408))).toBe(false);
    expect(isUpcomingCheckUnsupported(new Error('offline'))).toBe(false);
  });
});

describe('wording', () => {
  it('labels when a booking is', () => {
    expect(calendarUpcomingWhenLabel(booking())).toBe('Mon 30 Nov, 10:00 to 10:45');
    expect(calendarUpcomingWhenLabel(booking({ end_time: null }))).toBe('Mon 30 Nov, 10:00');
  });

  it('pluralises the venue\'s own word', () => {
    expect(pluralVenueTerm('Appointment', 'booking')).toBe('appointments');
    expect(pluralVenueTerm('Class', 'booking')).toBe('classes');
    expect(pluralVenueTerm('Party', 'booking')).toBe('parties');
    expect(pluralVenueTerm('', 'booking')).toBe('bookings');
    expect(countedBookingTerm(1, 'Appointment')).toBe('1 appointment');
    expect(countedBookingTerm(3, null)).toBe('3 bookings');
  });

  it('counts appointments in the venue\'s word, and anything else as bookings', () => {
    expect(describeUpcomingBookingCount(upcoming([booking()]), 'Appointment')).toBe(
      '1 upcoming appointment',
    );
    expect(describeUpcomingBookingCount(upcoming([booking()], 12), 'Appointment')).toBe(
      '12 upcoming appointments',
    );
    expect(
      describeUpcomingBookingCount(
        upcoming([booking(), booking({ key: 'c1', kind: 'class' })]),
        'Appointment',
      ),
    ).toBe('2 upcoming bookings');
  });

  it('says what pausing does, for one booking and for several', () => {
    const many = calendarPauseConsequences('Marcus', upcoming([booking(), booking({ key: 'b2' })]), TERMS);
    expect(many).toEqual([
      'They all stay booked. Your clients are not told anything.',
      'Marcus stops taking new bookings, online and from your team.',
      'Marcus still shows on your diary on any day with appointments, marked Paused, so nobody is missed.',
    ]);
    expect(calendarPauseConsequences('Marcus', upcoming([booking()]), TERMS)[0]).toBe(
      'This one stays booked. Your clients are not told anything.',
    );
  });

  it('says what removal does, and never that bookings stay on the diary', () => {
    const clear = calendarRemoveConfirmMessage('Marcus', TERMS, 'clear');
    expect(clear).toContain('Marcus will be removed for good');
    expect(clear).toContain('It has no upcoming appointments.');
    expect(clear).toContain("on each client's record");
    expect(clear).toContain('they no longer appear on your diary');

    expect(calendarRemoveConfirmMessage('Marcus', TERMS, 'checking')).toBe(
      'Checking Marcus for upcoming appointments…',
    );
    expect(calendarRemoveConfirmMessage('Marcus', TERMS, 'unknown')).toContain(
      'If Marcus has any, it will not be removed and you will see them listed here.',
    );
    // An older server refuses nothing, so nothing is promised about a refusal.
    const unchecked = calendarRemoveConfirmMessage('Marcus', TERMS, 'unchecked');
    expect(unchecked).not.toContain('will not be removed');
    expect(unchecked).toContain('Anything already booked on Marcus is kept');

    for (const state of ['checking', 'clear', 'unknown', 'unchecked'] as const) {
      const text = calendarRemoveConfirmMessage('Marcus', TERMS, state);
      expect(text).not.toContain('stay on the diary');
      expect(text).not.toMatch(/—/);
    }
  });

  it('says what to do about a refused removal, by whether the calendar is paused', () => {
    expect(calendarRemoveBlockedAdvice('Marcus', upcoming([booking()]), true)).toEqual([
      'Move or cancel it first, then remove the calendar.',
      'To stop new bookings in the meantime, pause Marcus instead: switch Active (bookable) off on its card. Everything already booked stays on your diary.',
    ]);
    expect(
      calendarRemoveBlockedAdvice('Marcus', upcoming([booking(), booking({ key: 'b2' })]), false),
    ).toEqual([
      'Move or cancel them first, then remove the calendar.',
      'Marcus is paused, so it takes no new bookings. Everything already booked stays on your diary.',
    ]);
  });
});
