/**
 * Which segments a bar's quick-action press has to write.
 *
 * The selection matters twice over: it decides what gets PATCHed, and — because
 * the screen treats the returned list as ONE batch — it decides what gets patched
 * optimistically and reconciled. An empty list must stay empty so a press that
 * changes nothing costs no refetch.
 */
import { arrivalToggleTargets, statusChangeTargets } from '@/lib/calendar/bar-actions';
import type { CalendarBookingCluster } from '@/lib/calendar/cluster-bookings';
import type { CalendarGridBooking } from '@/types/calendar-grid';

function booking(over: Partial<CalendarGridBooking> & { id: string }): CalendarGridBooking {
  return {
    guestName: 'Sam Patel',
    serviceName: 'Cut',
    startTime: '10:00',
    endTime: '10:30',
    status: 'Booked',
    ...over,
  };
}

/** Only the fields these selectors read; the rest of a cluster is irrelevant here. */
function cluster(bookings: CalendarGridBooking[]): CalendarBookingCluster {
  return { bookings, ids: bookings.map((b) => b.id) } as CalendarBookingCluster;
}

describe('statusChangeTargets', () => {
  it('returns every segment not already at the status', () => {
    const c = cluster([
      booking({ id: 'b1', status: 'Booked' }),
      booking({ id: 'b2', status: 'Booked' }),
      booking({ id: 'b3', status: 'Seated' }),
    ]);
    expect(statusChangeTargets(c, 'Seated')).toEqual(['b1', 'b2']);
  });

  it('is empty when the whole bar is already there', () => {
    const c = cluster([
      booking({ id: 'b1', status: 'Completed' }),
      booking({ id: 'b2', status: 'Completed' }),
    ]);
    expect(statusChangeTargets(c, 'Completed')).toEqual([]);
  });

  it('handles a standalone booking', () => {
    expect(statusChangeTargets(cluster([booking({ id: 'solo' })]), 'Seated')).toEqual(['solo']);
  });
});

describe('arrivalToggleTargets', () => {
  it('marks only the segments not yet arrived', () => {
    const c = cluster([
      booking({ id: 'b1', client_arrived_at: null }),
      booking({ id: 'b2', client_arrived_at: '2026-08-25T09:55:00Z' }),
    ]);
    expect(arrivalToggleTargets(c, true)).toEqual(['b1']);
  });

  it('clears only the segments currently arrived', () => {
    const c = cluster([
      booking({ id: 'b1', client_arrived_at: null }),
      booking({ id: 'b2', client_arrived_at: '2026-08-25T09:55:00Z' }),
    ]);
    expect(arrivalToggleTargets(c, false)).toEqual(['b2']);
  });

  it('treats an absent timestamp the same as an explicit null', () => {
    const c = cluster([booking({ id: 'b1' })]);
    expect(arrivalToggleTargets(c, true)).toEqual(['b1']);
    expect(arrivalToggleTargets(c, false)).toEqual([]);
  });
});
