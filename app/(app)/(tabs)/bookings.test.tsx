/**
 * Bookings list summary-stats memo (Domain 03) — pure unit test.
 *
 * `computeBookingSummary` powers the Total / Confirmed / Completed / No-shows
 * strip below the toolbar. Confirmed mirrors web semantics: explicit `Confirmed`
 * status OR either attendance timestamp. Imported as a pure function (no render),
 * matching the `buildDestinations` pattern in settings.test.tsx.
 */
import { computeBookingSummary } from '@/app/(app)/(tabs)/bookings';
import type { BookingListRow } from '@/types/booking-list';

function bk(overrides: Partial<BookingListRow> & { id: string }): BookingListRow {
  return {
    booking_date: '2026-06-18',
    booking_time: '09:00',
    party_size: 1,
    status: 'Booked',
    guest_name: 'Guest',
    deposit_status: null,
    ...overrides,
  };
}

describe('computeBookingSummary', () => {
  it('returns all-zero counts for an empty list', () => {
    expect(computeBookingSummary([])).toEqual({
      total: 0,
      confirmed: 0,
      completed: 0,
      noShows: 0,
    });
  });

  it('counts total as the row count regardless of status', () => {
    const rows = [bk({ id: 'a' }), bk({ id: 'b', status: 'Cancelled' }), bk({ id: 'c' })];
    expect(computeBookingSummary(rows).total).toBe(3);
  });

  it('counts confirmed by explicit status OR either attendance timestamp', () => {
    const rows = [
      bk({ id: 'explicit', status: 'Confirmed' }),
      bk({ id: 'guestTs', status: 'Booked', guest_attendance_confirmed_at: '2026-06-18T09:00:00Z' }),
      bk({ id: 'staffTs', status: 'Booked', staff_attendance_confirmed_at: '2026-06-18T09:00:00Z' }),
      bk({ id: 'plain', status: 'Booked' }),
    ];
    expect(computeBookingSummary(rows).confirmed).toBe(3);
  });

  it('counts completed and no-shows by exact status', () => {
    const rows = [
      bk({ id: 'c1', status: 'Completed' }),
      bk({ id: 'c2', status: 'Completed' }),
      bk({ id: 'n1', status: 'No-Show' }),
      bk({ id: 'b1', status: 'Booked' }),
    ];
    const summary = computeBookingSummary(rows);
    expect(summary.completed).toBe(2);
    expect(summary.noShows).toBe(1);
  });

  it('does not double-count a Confirmed row in completed/no-shows', () => {
    const rows = [bk({ id: 'a', status: 'Confirmed' })];
    expect(computeBookingSummary(rows)).toEqual({
      total: 1,
      confirmed: 1,
      completed: 0,
      noShows: 0,
    });
  });
});
