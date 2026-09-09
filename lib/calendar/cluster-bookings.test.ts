/**
 * One bar per booking row (web #187). A visit's services are independent bars
 * that know their place in the visit; a party's rows are plain bars.
 */
import { clusterCalendarBookings, type ClusterInput } from '@/lib/calendar/cluster-bookings';
import type { CalendarGridBooking } from '@/types/calendar-grid';

function item(
  id: string,
  start: number,
  end: number,
  over: Partial<CalendarGridBooking> = {},
): ClusterInput {
  return {
    booking: {
      id,
      guestName: 'Sam Patel',
      serviceName: 'Cut',
      startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
      status: 'Booked',
      ...over,
    },
    start,
    end,
  };
}

describe('clusterCalendarBookings', () => {
  it('returns nothing for no bookings', () => {
    expect(clusterCalendarBookings([])).toEqual([]);
  });

  it('draws every row as its own bar, in input order', () => {
    const out = clusterCalendarBookings([
      item('b2', 630, 660, { group_booking_id: 'g1', serviceName: 'Colour' }),
      item('b1', 600, 630, { group_booking_id: 'g1' }),
      item('solo', 700, 730),
    ]);
    expect(out.map((c) => c.lead.id)).toEqual(['b2', 'b1', 'solo']);
    expect(out.every((c) => c.bookings.length === 1 && !c.isMultiSegment && !c.isVisit)).toBe(true);
    expect(out[0]!.serviceLabel).toBe('Colour');
    expect(out[0]!.start).toBe(630);
    expect(out[0]!.end).toBe(660);
  });

  it('tells each service of a visit where it stands, anchored on the earliest', () => {
    const out = clusterCalendarBookings([
      item('b2', 630, 660, { group_booking_id: 'g1' }),
      item('b1', 600, 630, { group_booking_id: 'g1' }),
    ]);
    expect(out[0]!.visit).toEqual({ groupId: 'g1', index: 1, count: 2, anchorId: 'b1' });
    expect(out[1]!.visit).toEqual({ groupId: 'g1', index: 0, count: 2, anchorId: 'b1' });
    expect(out[0]!.groupBookingId).toBe('g1');
  });

  it('gives a party, a lone member and an ordinary booking no visit position', () => {
    const out = clusterCalendarBookings([
      item('p1', 600, 660, { group_booking_id: 'g1', person_label: 'Ana' }),
      item('p2', 600, 630, { group_booking_id: 'g1', person_label: 'Ben' }),
      item('lone', 700, 730, { group_booking_id: 'g2' }),
      item('solo', 800, 830),
    ]);
    expect(out.map((c) => c.visit)).toEqual([null, null, null, null]);
  });

  it('carries the row’s own status and paid state', () => {
    const out = clusterCalendarBookings([
      item('b1', 600, 630, { group_booking_id: 'g1', status: 'Completed', payment_state: 'paid' }),
      item('b2', 630, 660, { group_booking_id: 'g1', status: 'Booked' }),
    ]);
    expect(out[0]!.status).toBe('Completed');
    expect(out[0]!.paid).toBe(true);
    expect(out[1]!.status).toBe('Booked');
    expect(out[1]!.paid).toBe(false);
  });

  it('counts siblings over a wider set when told to', () => {
    const own = [item('b1', 600, 630, { group_booking_id: 'g1' })];
    const other = item('b2', 630, 660, { group_booking_id: 'g1' });
    const { visitSiblingIndex } = require('@/lib/calendar/visit-siblings');
    const positions = visitSiblingIndex([own[0]!.booking, other.booking]);
    expect(clusterCalendarBookings(own, positions)[0]!.visit).toEqual({
      groupId: 'g1',
      index: 0,
      count: 2,
      anchorId: 'b1',
    });
  });
});
