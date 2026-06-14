import {
  bookingCalendarBlockPalette,
  bookingDisplayVisualKey,
  bookingStatusVisualForKey,
  isArrivedWaitingDisplay,
  type BookingStatusVisualRow,
} from '@/lib/booking/booking-status-visual';

/**
 * Booking status visual derivations (pure). The exact hex values are data, not
 * logic, so the tests assert the *branching* — which visual key a row resolves
 * to (lifecycle + attendance + arrived overlay) and that lookups fall back to a
 * default — rather than pinning every colour.
 */

function row(overrides: Partial<BookingStatusVisualRow> & { status: string }): BookingStatusVisualRow {
  return { ...overrides };
}

describe('bookingStatusVisualForKey', () => {
  it('returns the mapped visual for a known status key', () => {
    const pending = bookingStatusVisualForKey('Pending');
    expect(pending.dotColor).toBe('#EA580C');
    expect(pending.calendarBlock.bg).toBe('#EA580C');
  });

  it('falls back to the default visual for an unknown key', () => {
    const fallback = bookingStatusVisualForKey('Totally-Unknown');
    expect(fallback).toEqual(bookingStatusVisualForKey('definitely-not-a-status'));
    expect(fallback.dotColor).toBe('#8A969C'); // DEFAULT.dotColor
  });
});

describe('isArrivedWaitingDisplay', () => {
  it('is true only when the guest has arrived AND status is Pending/Booked/Confirmed', () => {
    expect(isArrivedWaitingDisplay(row({ status: 'Pending', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(true);
    expect(isArrivedWaitingDisplay(row({ status: 'Booked', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(true);
    expect(isArrivedWaitingDisplay(row({ status: 'Confirmed', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(true);
  });

  it('is false without an arrival timestamp', () => {
    expect(isArrivedWaitingDisplay(row({ status: 'Pending' }))).toBe(false);
    expect(isArrivedWaitingDisplay(row({ status: 'Pending', client_arrived_at: null }))).toBe(false);
  });

  it('is false once the booking has already started/finished even if arrived is set', () => {
    expect(isArrivedWaitingDisplay(row({ status: 'Seated', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(false);
    expect(isArrivedWaitingDisplay(row({ status: 'Completed', client_arrived_at: '2026-06-09T10:00:00' }))).toBe(false);
  });
});

describe('bookingDisplayVisualKey', () => {
  it('passes through the terminal/explicit statuses', () => {
    expect(bookingDisplayVisualKey(row({ status: 'Cancelled' }))).toBe('Cancelled');
    expect(bookingDisplayVisualKey(row({ status: 'No-Show' }))).toBe('No-Show');
    expect(bookingDisplayVisualKey(row({ status: 'Completed' }))).toBe('Completed');
    expect(bookingDisplayVisualKey(row({ status: 'Seated' }))).toBe('Seated');
    expect(bookingDisplayVisualKey(row({ status: 'Confirmed' }))).toBe('Confirmed');
  });

  it('maps a bare Pending / Booked row to its own key', () => {
    expect(bookingDisplayVisualKey(row({ status: 'Pending' }))).toBe('Pending');
    expect(bookingDisplayVisualKey(row({ status: 'Booked' }))).toBe('Booked');
  });

  it('overlays Arrived when the guest arrived while still waiting', () => {
    expect(
      bookingDisplayVisualKey(row({ status: 'Booked', client_arrived_at: '2026-06-09T10:00:00' })),
    ).toBe('Arrived');
  });

  it('promotes Pending/Booked to Confirmed when attendance is confirmed', () => {
    expect(
      bookingDisplayVisualKey(row({ status: 'Pending', staff_attendance_confirmed_at: '2026-06-09T10:00:00' })),
    ).toBe('Confirmed');
    expect(
      bookingDisplayVisualKey(row({ status: 'Booked', guest_attendance_confirmed_at: '2026-06-09T10:00:00' })),
    ).toBe('Confirmed');
  });

  it('prefers the Arrived overlay over the attendance-confirmed promotion', () => {
    // Arrived is checked before the Pending/Booked attendance branch.
    expect(
      bookingDisplayVisualKey(
        row({
          status: 'Booked',
          client_arrived_at: '2026-06-09T10:00:00',
          staff_attendance_confirmed_at: '2026-06-09T10:05:00',
        }),
      ),
    ).toBe('Arrived');
  });

  it('defaults an unrecognised status to Booked', () => {
    expect(bookingDisplayVisualKey(row({ status: 'Weird' }))).toBe('Booked');
  });
});

describe('bookingCalendarBlockPalette', () => {
  it('resolves the calendar block through the display visual key', () => {
    // A Pending+arrived row should resolve to the Arrived block, not Pending's.
    const arrived = bookingCalendarBlockPalette(
      row({ status: 'Pending', client_arrived_at: '2026-06-09T10:00:00' }),
    );
    expect(arrived).toEqual(bookingStatusVisualForKey('Arrived').calendarBlock);
    expect(arrived.bg).toBe('#F59E0B');
  });

  it('returns the Seated block for a started booking', () => {
    expect(bookingCalendarBlockPalette(row({ status: 'Seated' }))).toEqual(
      bookingStatusVisualForKey('Seated').calendarBlock,
    );
  });
});
