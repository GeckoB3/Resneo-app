import {
  bookingTimelineEventsForDisplay,
  formatBookingTimelineEvent,
  formatTimelineEventTime,
  shouldShowBookingTimelineEvent,
  type BookingTimelineEventRow,
} from '@/lib/booking/booking-timeline';

/**
 * Booking activity timeline derivations (pure). These mirror the web
 * `format-booking-timeline-event` helper: which raw events surface, their
 * human title/detail, and the ordered display list.
 *
 * Timezone note: `formatBookingTimelineEvent`'s schedule-change details format
 * `booking_date` via date-fns after parsing "<date>T12:00:00" (local noon, no
 * Z), and `formatTimelineEventTime` parses a *zoneless* ISO string — both render
 * in the runner's local zone but on a fixed calendar day/clock for the literal
 * inputs used here, so assertions are stable on any realistic dev/CI machine.
 */

function event(overrides: Partial<BookingTimelineEventRow> & { event_type: string }): BookingTimelineEventRow {
  return {
    id: 'evt-1',
    created_at: '2026-06-09T14:30:00',
    payload: null,
    ...overrides,
  };
}

describe('shouldShowBookingTimelineEvent', () => {
  it('always shows created / modified / auto_cancelled / waitlist_converted', () => {
    expect(shouldShowBookingTimelineEvent(event({ event_type: 'booking_created' }))).toBe(true);
    expect(shouldShowBookingTimelineEvent(event({ event_type: 'booking_modified' }))).toBe(true);
    expect(shouldShowBookingTimelineEvent(event({ event_type: 'auto_cancelled' }))).toBe(true);
    expect(shouldShowBookingTimelineEvent(event({ event_type: 'waitlist_converted' }))).toBe(true);
  });

  // Web QA B-5 (2026-09-23): only confirmations used to show, so cancel, reinstate, start and
  // complete were missing from the audit trail.
  it('shows every status change once: the trigger shape, not the staff route audit copy', () => {
    expect(
      shouldShowBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { new_status: 'Confirmed' } }),
      ),
    ).toBe(true);
    expect(
      shouldShowBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { old_status: 'Pending', new_status: 'Booked' } }),
      ),
    ).toBe(true);
    expect(
      shouldShowBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { new_status: 'Seated' } }),
      ),
    ).toBe(true);
    expect(
      shouldShowBookingTimelineEvent(
        event({
          event_type: 'booking_status_changed',
          payload: { from: 'Pending', to: 'Booked', staff_id: 'staff-1' },
        }),
      ),
    ).toBe(false);
    expect(
      shouldShowBookingTimelineEvent(event({ event_type: 'booking_status_changed', payload: null })),
    ).toBe(false);
  });

  it('shows arrivals', () => {
    expect(
      shouldShowBookingTimelineEvent(event({ event_type: 'client_arrived_changed', payload: { arrived: true } })),
    ).toBe(true);
  });

  it('hides unknown event types', () => {
    expect(shouldShowBookingTimelineEvent(event({ event_type: 'something_else' }))).toBe(false);
    expect(shouldShowBookingTimelineEvent(event({ event_type: 'reminder_sent' }))).toBe(false);
  });
});

describe('formatBookingTimelineEvent', () => {
  it('titles a created booking', () => {
    expect(formatBookingTimelineEvent(event({ event_type: 'booking_created' }))).toEqual({
      title: 'Booking created',
    });
  });

  it('describes who confirmed for a status change', () => {
    expect(
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { confirmed_by: 'guest' } }),
      ),
    ).toEqual({ title: 'Confirmed by guest' });
    expect(
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { confirmed_by: 'staff' } }),
      ),
    ).toEqual({ title: 'Confirmed by staff' });
    expect(
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { confirmed_by: 'both' } }),
      ),
    ).toEqual({ title: 'Confirmed by guest and staff' });
  });

  it('falls back to "Booking confirmed" with a from-status detail', () => {
    expect(
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { old_status: 'Pending' } }),
      ),
    ).toEqual({ title: 'Booking confirmed', detail: 'From Pending' });
  });

  it('omits the from-status detail when the old status was already Confirmed', () => {
    expect(
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { old_status: 'Confirmed' } }),
      ),
    ).toEqual({ title: 'Booking confirmed', detail: undefined });
  });

  it('replaces underscores in the from-status detail', () => {
    expect(
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { old_status: 'No_Show' } }),
      ),
    ).toEqual({ title: 'Booking confirmed', detail: 'From No Show' });
  });

  describe('status changes and arrivals (web QA B-5)', () => {
    const status = (old_status: string, new_status: string) =>
      formatBookingTimelineEvent(
        event({ event_type: 'booking_status_changed', payload: { old_status, new_status } }),
      ).title;

    it('names each change the way the buttons do', () => {
      expect(status('Booked', 'Cancelled')).toBe('Booking cancelled');
      expect(status('Cancelled', 'Booked')).toBe('Booking reinstated');
      expect(status('Booked', 'Seated')).toBe('Started');
      expect(status('Seated', 'Booked')).toBe('Start undone');
      expect(status('Seated', 'Completed')).toBe('Completed');
      expect(status('Completed', 'Seated')).toBe('Completion undone');
      expect(status('Booked', 'No-Show')).toBe('Marked as a no-show');
      expect(status('No-Show', 'Booked')).toBe('No-show undone');
      expect(status('Confirmed', 'Booked')).toBe('Confirmation undone');
    });

    it('keeps the from-status detail on a cancellation and an unnamed change', () => {
      expect(
        formatBookingTimelineEvent(
          event({ event_type: 'booking_status_changed', payload: { old_status: 'Booked', new_status: 'Cancelled' } }),
        ),
      ).toEqual({ title: 'Booking cancelled', detail: 'From Booked' });
      expect(
        formatBookingTimelineEvent(
          event({ event_type: 'booking_status_changed', payload: { old_status: 'Pending', new_status: 'Booked' } }),
        ),
      ).toEqual({ title: 'Status changed to Booked', detail: 'From Pending' });
    });

    it('still titles a change to Confirmed as a confirmation', () => {
      expect(status('Booked', 'Confirmed')).toBe('Booking confirmed');
    });

    it('titles an arrival and its undo', () => {
      expect(
        formatBookingTimelineEvent(event({ event_type: 'client_arrived_changed', payload: { arrived: true } })),
      ).toEqual({ title: 'Client arrived' });
      expect(
        formatBookingTimelineEvent(event({ event_type: 'client_arrived_changed', payload: { arrived: false } })),
      ).toEqual({ title: 'Arrival undone' });
    });
  });

  it('labels a modification by actor and summarises a time change', () => {
    const result = formatBookingTimelineEvent(
      event({
        event_type: 'booking_modified',
        payload: {
          modification_actor: 'guest',
          before: { booking_time: '10:00' },
          after: { booking_time: '11:30' },
        },
      }),
    );
    expect(result.title).toBe('Booking modified (Guest)');
    expect(result.detail).toBe('Time 10:00 → 11:30');
  });

  it('summarises multiple schedule changes joined by a middot, and pads time to HH:mm', () => {
    const result = formatBookingTimelineEvent(
      event({
        event_type: 'booking_modified',
        payload: {
          modification_actor: 'staff',
          before: { booking_time: '09:00:00', party_size: 2 },
          after: { booking_time: '09:30:00', party_size: 4 },
        },
      }),
    );
    expect(result.title).toBe('Booking modified (Staff)');
    expect(result.detail).toBe('Time 09:00 → 09:30 · Party size 2 → 4');
  });

  it('reports end-time set / removed transitions', () => {
    const setEnd = formatBookingTimelineEvent(
      event({
        event_type: 'booking_modified',
        payload: { before: {}, after: { booking_end_time: '12:00' } },
      }),
    );
    expect(setEnd.detail).toBe('End set to 12:00');

    const removedEnd = formatBookingTimelineEvent(
      event({
        event_type: 'booking_modified',
        payload: { before: { booking_end_time: '12:00' }, after: {} },
      }),
    );
    expect(removedEnd.detail).toBe('End removed (was 12:00)');
  });

  it('uses a generic detail when a modification has no recognised field changes', () => {
    const result = formatBookingTimelineEvent(
      event({ event_type: 'booking_modified', payload: { modification_actor: 'guest', before: {}, after: {} } }),
    );
    expect(result).toEqual({ title: 'Booking modified (Guest)', detail: 'Booking details updated' });
  });

  it('uses "User" as the actor when the modification actor is absent', () => {
    const result = formatBookingTimelineEvent(
      event({ event_type: 'booking_modified', payload: { before: {}, after: {} } }),
    );
    expect(result.title).toBe('Booking modified (User)');
  });

  it('titles auto-cancelled and waitlist-converted events', () => {
    expect(formatBookingTimelineEvent(event({ event_type: 'auto_cancelled' }))).toEqual({
      title: 'Booking auto-cancelled',
    });
    expect(formatBookingTimelineEvent(event({ event_type: 'waitlist_converted' }))).toEqual({
      title: 'Converted from waitlist',
    });
  });

  it('humanises an unknown event type (underscores → spaces, title-cased)', () => {
    expect(formatBookingTimelineEvent(event({ event_type: 'reminder_sent' }))).toEqual({
      title: 'Reminder Sent',
    });
  });
});

describe('bookingTimelineEventsForDisplay', () => {
  it('filters to displayable events and attaches title/detail, preserving order', () => {
    const events: BookingTimelineEventRow[] = [
      event({ id: 'a', event_type: 'booking_created' }),
      event({ id: 'b', event_type: 'reminder_sent' }), // dropped
      event({
        id: 'c',
        event_type: 'booking_status_changed',
        payload: { from: 'Booked', to: 'Seated', staff_id: 'staff-1' },
      }), // dropped: the staff route's audit copy of a change the trigger already logged
      event({
        id: 'd',
        event_type: 'booking_status_changed',
        payload: { new_status: 'Confirmed', confirmed_by: 'guest' },
      }),
      event({ id: 'e', event_type: 'waitlist_converted' }),
    ];

    const display = bookingTimelineEventsForDisplay(events);

    expect(display.map((d) => d.id)).toEqual(['a', 'd', 'e']);
    expect(display.map((d) => d.title)).toEqual([
      'Booking created',
      'Confirmed by guest',
      'Converted from waitlist',
    ]);
    // Original row fields are spread through onto the display row.
    expect(display[0].event_type).toBe('booking_created');
    expect(display[0].created_at).toBe('2026-06-09T14:30:00');
  });

  it('returns an empty array when nothing is displayable', () => {
    expect(
      bookingTimelineEventsForDisplay([event({ event_type: 'reminder_sent' })]),
    ).toEqual([]);
  });
});

describe('formatTimelineEventTime', () => {
  it('formats a zoneless ISO timestamp as "d MMM, HH:mm"', () => {
    expect(formatTimelineEventTime('2026-06-09T14:30:00')).toBe('9 Jun, 14:30');
    expect(formatTimelineEventTime('2026-12-01T08:05:00')).toBe('1 Dec, 08:05');
  });

  it('returns the raw input unchanged when it cannot be parsed', () => {
    expect(formatTimelineEventTime('not-a-date')).toBe('not-a-date');
  });
});
