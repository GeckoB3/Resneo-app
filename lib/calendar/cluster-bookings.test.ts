/**
 * Merging a visit's bookings into one calendar bar.
 *
 * The grid drew one bar per ROW, so a three-service visit looked like three
 * appointments. Two things are pinned here: WHAT groups (web parity — the
 * `group_booking_id` alone, with no `person_label` rule), and the SPAN, where we
 * deliberately differ from the web by taking the latest end rather than the
 * last-starting segment's end.
 */
import { clusterCalendarBookings, type ClusterInput } from '@/lib/calendar/cluster-bookings';
import type { CalendarGridBooking } from '@/types/calendar-grid';

function booking(over: Partial<CalendarGridBooking> & { id: string }): CalendarGridBooking {
  return {
    guestName: 'Sam Patel',
    serviceName: 'Cut',
    startTime: '09:00',
    endTime: '09:30',
    status: 'Booked',
    ...over,
  };
}

/** `{ booking, start, end }` as every grid computes it before positioning. */
function seg(
  id: string,
  start: number,
  end: number,
  over: Partial<CalendarGridBooking> = {},
): ClusterInput {
  return { booking: booking({ id, ...over }), start, end };
}

describe('clusterCalendarBookings — what groups', () => {
  it('returns nothing for no bookings', () => {
    expect(clusterCalendarBookings([])).toEqual([]);
  });

  it('leaves an ungrouped booking alone', () => {
    const out = clusterCalendarBookings([seg('b1', 540, 570)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.isMultiSegment).toBe(false);
    expect(out[0]!.ids).toEqual(['b1']);
  });

  it('merges consecutive services of one visit into a single bar', () => {
    const out = clusterCalendarBookings([
      seg('b1', 540, 570, { group_booking_id: 'g1', serviceName: 'Cut' }),
      seg('b2', 570, 630, { group_booking_id: 'g1', serviceName: 'Colour' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.isMultiSegment).toBe(true);
    expect(out[0]!.ids).toEqual(['b1', 'b2']);
    expect(out[0]!.start).toBe(540);
    expect(out[0]!.end).toBe(630);
  });

  it('merges a group of PEOPLE too — web parity, no person_label rule', () => {
    // The bookings list deliberately refuses to collapse these; the calendar
    // deliberately does. Do not "fix" this into the list's rule.
    const out = clusterCalendarBookings([
      seg('b1', 600, 660, { group_booking_id: 'g1', person_label: 'Person 1' }),
      seg('b2', 600, 660, { group_booking_id: 'g1', person_label: 'Person 2' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.isMultiSegment).toBe(true);
  });

  it('keeps separate visits separate', () => {
    const out = clusterCalendarBookings([
      seg('b1', 540, 570, { group_booking_id: 'g1' }),
      seg('b2', 570, 600, { group_booking_id: 'g1' }),
      seg('b3', 600, 630, { group_booking_id: 'g2' }),
      seg('b4', 630, 660, { group_booking_id: 'g2' }),
    ]);
    expect(out.map((c) => c.ids)).toEqual([
      ['b1', 'b2'],
      ['b3', 'b4'],
    ]);
  });

  it('treats a lone member of a group as an ordinary booking', () => {
    // Routine: the status filter hid its siblings, or they sit on another
    // calendar or another day. It must stay draggable, so isMultiSegment is false.
    const out = clusterCalendarBookings([seg('b1', 540, 570, { group_booking_id: 'g1' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.isMultiSegment).toBe(false);
  });

  it('never groups on an absent or blank group id', () => {
    const out = clusterCalendarBookings([
      seg('b1', 540, 570),
      seg('b2', 570, 600, { group_booking_id: null }),
      seg('b3', 600, 630, { group_booking_id: '' }),
      seg('b4', 630, 660, { group_booking_id: '   ' }),
    ]);
    expect(out).toHaveLength(4);
    expect(out.every((c) => !c.isMultiSegment)).toBe(true);
  });

  it('emits each visit once, where it first appears', () => {
    const out = clusterCalendarBookings([
      seg('solo-early', 480, 510),
      seg('b1', 540, 570, { group_booking_id: 'g1' }),
      seg('solo-mid', 545, 555),
      seg('b2', 570, 600, { group_booking_id: 'g1' }),
    ]);
    expect(out.map((c) => c.lead.id)).toEqual(['solo-early', 'b1', 'solo-mid']);
  });
});

describe('clusterCalendarBookings — the span', () => {
  it('runs from the earliest start to the latest end', () => {
    const out = clusterCalendarBookings([
      seg('b2', 570, 630, { group_booking_id: 'g1' }),
      seg('b1', 540, 570, { group_booking_id: 'g1' }),
    ]);
    expect(out[0]!.start).toBe(540);
    expect(out[0]!.end).toBe(630);
  });

  it('takes the LATEST end, not the last-starting segment’s end', () => {
    /**
     * The web bug this deliberately avoids. Three people all at 10:00 for 60, 30
     * and 45 minutes: sorted by start they tie, so the last one is arbitrary. The
     * web would end the bar at that arbitrary segment — 10:30 here — leaving a
     * visit that runs to 11:00 drawn half length, with the grid free to place
     * something over the remainder.
     */
    const out = clusterCalendarBookings([
      seg('b-long', 600, 660, { group_booking_id: 'g1' }),
      seg('b-mid', 600, 645, { group_booking_id: 'g1' }),
      seg('b-short', 600, 630, { group_booking_id: 'g1' }),
    ]);
    expect(out[0]!.end).toBe(660);
  });

  it('is not fooled by a long segment sitting in the middle', () => {
    const out = clusterCalendarBookings([
      seg('b1', 540, 570, { group_booking_id: 'g1' }),
      seg('b2', 550, 700, { group_booking_id: 'g1' }),
      seg('b3', 570, 600, { group_booking_id: 'g1' }),
    ]);
    expect(out[0]!.start).toBe(540);
    expect(out[0]!.end).toBe(700);
  });

  it('orders tied starts by id so the bar is identical on every load', () => {
    const first = clusterCalendarBookings([
      seg('b-z', 600, 630, { group_booking_id: 'g1' }),
      seg('b-a', 600, 660, { group_booking_id: 'g1' }),
    ]);
    const reversed = clusterCalendarBookings([
      seg('b-a', 600, 660, { group_booking_id: 'g1' }),
      seg('b-z', 600, 630, { group_booking_id: 'g1' }),
    ]);
    expect(first[0]!.ids).toEqual(['b-a', 'b-z']);
    expect(reversed[0]!.ids).toEqual(['b-a', 'b-z']);
    expect(first[0]!.lead.id).toBe('b-a');
  });

  it('leads with the earliest segment, whatever order the rows arrive in', () => {
    const out = clusterCalendarBookings([
      seg('b-late', 570, 600, { group_booking_id: 'g1' }),
      seg('b-early', 540, 570, { group_booking_id: 'g1' }),
    ]);
    expect(out[0]!.lead.id).toBe('b-early');
  });
});

describe('clusterCalendarBookings — what the bar shows', () => {
  it('joins the services in visit order', () => {
    const out = clusterCalendarBookings([
      seg('b2', 570, 630, { group_booking_id: 'g1', serviceName: 'Colour' }),
      seg('b1', 540, 570, { group_booking_id: 'g1', serviceName: 'Cut' }),
    ]);
    expect(out[0]!.serviceLabel).toBe('Cut → Colour');
  });

  it('repeats a shared service rather than de-duplicating it (web parity)', () => {
    const out = clusterCalendarBookings([
      seg('b1', 600, 630, { group_booking_id: 'g1', serviceName: 'Cut' }),
      seg('b2', 600, 630, { group_booking_id: 'g1', serviceName: 'Cut' }),
    ]);
    expect(out[0]!.serviceLabel).toBe('Cut → Cut');
  });

  it('skips segments with no service name instead of leaving a stray arrow', () => {
    const out = clusterCalendarBookings([
      seg('b1', 540, 570, { group_booking_id: 'g1', serviceName: 'Cut' }),
      seg('b2', 570, 600, { group_booking_id: 'g1', serviceName: '  ' }),
    ]);
    expect(out[0]!.serviceLabel).toBe('Cut');
  });

  it('passes a standalone booking’s own service through', () => {
    expect(clusterCalendarBookings([seg('b1', 540, 570)])[0]!.serviceLabel).toBe('Cut');
  });

  it('is paid only when every segment is settled', () => {
    const allPaid = clusterCalendarBookings([
      seg('b1', 540, 570, { group_booking_id: 'g1', payment_state: 'paid' }),
      seg('b2', 570, 600, { group_booking_id: 'g1', payment_state: 'paid' }),
    ]);
    const partPaid = clusterCalendarBookings([
      seg('b1', 540, 570, { group_booking_id: 'g1', payment_state: 'paid' }),
      seg('b2', 570, 600, { group_booking_id: 'g1', payment_state: 'unpaid' }),
    ]);
    expect(allPaid[0]!.paid).toBe(true);
    expect(partPaid[0]!.paid).toBe(false);
  });
});
