/**
 * Bookings list summary-stats memo (Domain 03) — pure unit test.
 *
 * `computeBookingSummary` powers the Total / Confirmed / Completed / No-shows
 * strip below the toolbar. Confirmed mirrors web semantics: explicit `Confirmed`
 * status OR either attendance timestamp. Imported as a pure function (no render),
 * matching the `buildDestinations` pattern in settings.test.tsx.
 */
import { computeBookingSummary, defaultVenueSelection, rangeFor } from '@/app/(app)/(tabs)/bookings';
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

/**
 * Which venues the list starts on. A partner booking made in the app has to be
 * findable in the list afterwards — with linked venues unticked by default, a
 * search for its guest answered "No appointments" and said nothing about the
 * venue it had left out (device test, 2026-09-12).
 */
describe('defaultVenueSelection', () => {
  it('shows this venue and every linked one when nothing is in context', () => {
    const sel = defaultVenueSelection(null, ['v1', 'v2']);
    expect(sel.own).toBe(true);
    expect([...sel.linked]).toEqual(['v1', 'v2']);
  });

  it('shows only the linked venue being acted as, when one is in context', () => {
    const sel = defaultVenueSelection('v2', ['v1', 'v2']);
    expect(sel.own).toBe(false);
    expect([...sel.linked]).toEqual(['v2']);
  });

  it('falls back to this venue when the context venue is no longer linked', () => {
    const sel = defaultVenueSelection('gone', ['v1']);
    expect(sel.own).toBe(true);
    expect([...sel.linked]).toEqual(['v1']);
  });

  it('is just this venue when there are no linked venues at all', () => {
    const sel = defaultVenueSelection(null, []);
    expect(sel.own).toBe(true);
    expect(sel.linked.size).toBe(0);
  });
});

/**
 * The dates the list covers for the shared day (2026-11-06 is a Friday). Week is the Monday-to-
 * Sunday week the day falls in, as on the Calendar tab and the web; Custom starts on the day.
 */
describe('rangeFor', () => {
  it('is the day itself in Day', () => {
    expect(rangeFor('day', '2026-11-06', null)).toEqual({ from: '2026-11-06', to: '2026-11-06' });
  });

  it('is the Monday-to-Sunday week in Week', () => {
    expect(rangeFor('week', '2026-11-06', null)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(rangeFor('week', '2026-11-08', null)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('is the whole month in Month', () => {
    expect(rangeFor('month', '2026-11-06', null)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('starts Custom on the shared day and keeps its length', () => {
    expect(rangeFor('custom', '2026-11-06', 3)).toEqual({ from: '2026-11-06', to: '2026-11-09' });
    expect(rangeFor('custom', '2026-11-06', null)).toEqual({ from: '2026-11-06', to: '2026-11-06' });
  });
});
