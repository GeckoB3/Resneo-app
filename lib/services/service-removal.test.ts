/**
 * R35-1/R35-2 — the wire shapes behind "stopping a calendar offering a service
 * keeps its existing bookings" (web #194).
 *
 * Pinned against the real payload builder and the client-safe module in
 * C:\Resneo:
 *   - src/lib/venue/service-calendar-removal.ts  (serviceRemovalConfirmationPayload)
 *   - src/lib/venue/service-removal-bookings.ts  (parse + move semantics)
 */
import {
  affectedBookingLabel,
  affectedCalendarIds,
  affectedServiceIds,
  affectedBookingWhen,
  groupServiceRemovalBookings,
  parseServiceRemovalConfirmation,
  runServiceRemovalMoves,
  serviceRemovalListKey,
  serviceRemovalMoveInput,
  serviceRemovalMoves,
  serviceRemovalPrimaryLabel,
  withoutMovedBookings,
  type ServiceRemovalAffectedBooking,
} from '@/lib/services/service-removal';

function booking(
  over: Partial<ServiceRemovalAffectedBooking> & { id: string },
): ServiceRemovalAffectedBooking {
  return {
    service_id: 'svc-1',
    service_name: 'Cut and finish',
    calendar_id: 'cal-1',
    calendar_name: 'Chair 1',
    booking_date: '2026-10-14',
    booking_time: '10:00',
    end_time: '11:00',
    guest_name: 'Alex Smith',
    party_size: 1,
    status: 'Booked',
    ...over,
  };
}

/** The body the route actually sends, field for field. */
function confirmationBody(bookings: ServiceRemovalAffectedBooking[], over?: Record<string, unknown>) {
  return {
    requires_confirmation: true,
    message: '2 upcoming bookings are already booked for Cut and finish on Chair 1.',
    error: '2 upcoming bookings are already booked for Cut and finish on Chair 1.',
    affected_bookings: bookings,
    affected_total: bookings.length,
    affected_truncated: false,
    ...over,
  };
}

describe('parseServiceRemovalConfirmation', () => {
  it('reads the route body', () => {
    const parsed = parseServiceRemovalConfirmation(confirmationBody([booking({ id: 'b1' })]));
    expect(parsed).not.toBeNull();
    expect(parsed?.message).toContain('already booked');
    expect(parsed?.bookings).toHaveLength(1);
    expect(parsed?.total).toBe(1);
    expect(parsed?.truncated).toBe(false);
  });

  it('keeps the exact total when the sample is capped', () => {
    const parsed = parseServiceRemovalConfirmation(
      confirmationBody([booking({ id: 'b1' })], { affected_total: 320, affected_truncated: true }),
    );
    expect(parsed?.total).toBe(320);
    expect(parsed?.truncated).toBe(true);
  });

  it('returns null for an ordinary error body, so a plain 409 still reads as a refusal', () => {
    expect(parseServiceRemovalConfirmation({ error: 'A service with that name exists' })).toBeNull();
    expect(parseServiceRemovalConfirmation(null)).toBeNull();
    expect(parseServiceRemovalConfirmation('nope')).toBeNull();
    // The flag alone is not enough: without the list there is nothing to show.
    expect(parseServiceRemovalConfirmation({ requires_confirmation: true })).toBeNull();
  });

  it('falls back to its own sentence when the route sends no message', () => {
    const parsed = parseServiceRemovalConfirmation({
      requires_confirmation: true,
      affected_bookings: [booking({ id: 'b1' })],
    });
    expect(parsed?.message).toMatch(/already booked/i);
  });
});

describe('grouping and moves', () => {
  const bookings = [
    booking({ id: 'b1' }),
    booking({ id: 'b2', booking_time: '12:00' }),
    booking({ id: 'b3', calendar_id: 'cal-2', calendar_name: 'Chair 2' }),
    booking({ id: 'b4', service_id: 'svc-2', service_name: 'Colour' }),
  ];

  it('groups by calendar and service, keeping the server order inside a group', () => {
    const groups = groupServiceRemovalBookings(bookings);
    expect(groups).toHaveLength(3);
    expect(groups[0]!.bookings.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(groups[0]!.calendarName).toBe('Chair 1');
    expect(groups[1]!.calendarName).toBe('Chair 2');
    expect(groups[2]!.serviceName).toBe('Colour');
  });

  it('turns per-group targets into one move per booking, and leaves untargeted groups alone', () => {
    const groups = groupServiceRemovalBookings(bookings);
    const moves = serviceRemovalMoves(groups, { [groups[0]!.key]: 'cal-9' });
    expect(moves).toEqual([
      { bookingId: 'b1', targetCalendarId: 'cal-9' },
      { bookingId: 'b2', targetCalendarId: 'cal-9' },
    ]);
  });

  it('changes the list key when bookings drop out, so the panel resets its choices', () => {
    const before = serviceRemovalListKey(groupServiceRemovalBookings(bookings));
    const after = serviceRemovalListKey(
      groupServiceRemovalBookings(bookings.filter((b) => b.id !== 'b2')),
    );
    expect(after).not.toBe(before);
  });
});

describe('what a cancelled confirmation puts back', () => {
  it('names only the calendars and services the question was about', () => {
    const confirmation = {
      message: 'm',
      bookings: [
        booking({ id: 'b1' }),
        booking({ id: 'b2' }),
        booking({ id: 'b3', calendar_id: 'cal-2', service_id: 'svc-2' }),
      ],
      total: 3,
      truncated: false,
    };
    expect(affectedCalendarIds(confirmation)).toEqual(['cal-1', 'cal-2']);
    expect(affectedServiceIds(confirmation)).toEqual(['svc-1', 'svc-2']);
  });
});

describe('serviceRemovalMoveInput', () => {
  it('keeps the date, the time and the REAL end, and never emails the guest', () => {
    expect(serviceRemovalMoveInput(booking({ id: 'b1' }), 'cal-9')).toEqual({
      bookingId: 'b1',
      date: '2026-10-14',
      time: '10:00',
      endTime: '11:00:00',
      practitionerId: 'cal-9',
      skipGuestNotification: true,
    });
  });

  it('omits the end when the row carries none, rather than inventing one', () => {
    const input = serviceRemovalMoveInput(booking({ id: 'b1', end_time: null }), 'cal-9');
    expect(input).not.toHaveProperty('endTime');
  });
});

describe('runServiceRemovalMoves', () => {
  const bookings = [booking({ id: 'b1' }), booking({ id: 'b2', booking_time: '12:00' })];

  it('moves each booking in turn and reports the ones that succeeded', async () => {
    const move = jest.fn().mockResolvedValue(undefined);
    const { movedIds, failures } = await runServiceRemovalMoves(
      [
        { bookingId: 'b1', targetCalendarId: 'cal-9' },
        { bookingId: 'b2', targetCalendarId: 'cal-9' },
      ],
      bookings,
      move,
    );
    expect(move).toHaveBeenCalledTimes(2);
    expect([...movedIds]).toEqual(['b1', 'b2']);
    expect(failures).toEqual([]);
  });

  it('one clash does not take the rest down, and is named with its reason', async () => {
    const move = jest
      .fn()
      .mockRejectedValueOnce(new Error('That time is already booked'))
      .mockResolvedValueOnce(undefined);
    const { movedIds, failures } = await runServiceRemovalMoves(
      [
        { bookingId: 'b1', targetCalendarId: 'cal-9' },
        { bookingId: 'b2', targetCalendarId: 'cal-9' },
      ],
      bookings,
      move,
    );
    expect([...movedIds]).toEqual(['b2']);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.bookingId).toBe('b1');
    expect(failures[0]!.reason).toBe('That time is already booked');
    expect(failures[0]!.label).toContain('Alex Smith');
  });
});

describe('withoutMovedBookings', () => {
  it('drops what moved and brings the exact total down with it', () => {
    const confirmation = {
      message: 'm',
      bookings: [booking({ id: 'b1' }), booking({ id: 'b2' })],
      total: 5,
      truncated: true,
    };
    const next = withoutMovedBookings(confirmation, new Set(['b1']));
    expect(next.bookings.map((b) => b.id)).toEqual(['b2']);
    expect(next.total).toBe(4);
  });

  it('is a no-op when nothing moved', () => {
    const confirmation = { message: 'm', bookings: [booking({ id: 'b1' })], total: 1, truncated: false };
    expect(withoutMovedBookings(confirmation, new Set())).toBe(confirmation);
  });
});

describe('copy', () => {
  it('says what the primary button will do', () => {
    expect(serviceRemovalPrimaryLabel(0)).toBe('Save and leave these bookings here');
    expect(serviceRemovalPrimaryLabel(1)).toBe('Move 1 booking and save');
    expect(serviceRemovalPrimaryLabel(3)).toBe('Move 3 bookings and save');
  });

  it('names a booking by guest, day and time', () => {
    expect(affectedBookingLabel(booking({ id: 'b1' }))).toBe('Alex Smith, Wed 14 Oct, 10:00');
    expect(affectedBookingWhen(booking({ id: 'b1' }))).toBe('Wed 14 Oct, 10:00 to 11:00');
    expect(affectedBookingWhen(booking({ id: 'b1', end_time: null }))).toBe('Wed 14 Oct, 10:00');
  });
});
