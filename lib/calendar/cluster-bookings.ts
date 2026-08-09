/**
 * Merge the bookings of one visit into a single calendar bar.
 *
 * A visit taken as several bookings — back-to-back services for one client, or a
 * group booked together — shares a `group_booking_id`. The grid drew one bar per
 * ROW, so a three-service visit looked like three separate appointments stacked
 * up the column. This turns each group into one bar.
 *
 * WEB PARITY, deliberately: clustering keys on `group_booking_id` ALONE, exactly
 * like the web calendar's `clusterMultiServiceBookings`. It does NOT apply the
 * bookings list's extra rule (`isMultiServiceVisitGroup`, which excludes rows
 * carrying a `person_label`), so a group of several PEOPLE in one column merges
 * too. That is the owner's call: group bookings are taken under a single contact
 * and the individuals are freetext names, so little is lost, and the booking
 * detail still tells the two apart — `GroupVisitCards` switches on `person_label`
 * to render "Services in this visit" or a per-person list.
 *
 * ONE DELIBERATE DIFFERENCE from the web. Its `clusterTimeRange` ends the bar at
 * the LAST-STARTING segment's end:
 *
 *     const last = items[items.length - 1];
 *     const end = timeToMinutes(last.booking_time) + getDuration(last);
 *
 * For consecutive services that is right — the last to start is the last to
 * finish. For a group booked at the SAME time it is not: three people starting
 * at 10:00 for 60, 30 and 45 minutes sort arbitrarily among themselves, so if
 * the 30-minute one lands last the bar renders 10:00–10:30 for a visit that runs
 * to 11:00 — too short, and the grid would then let something else sit on top of
 * it. We take the MAXIMUM end instead: identical for every consecutive visit,
 * and correct for concurrent ones.
 */

import type { CalendarGridBooking } from '@/types/calendar-grid';

/** A booking with its resolved minute range, as every grid already computes. */
export interface ClusterInput {
  booking: CalendarGridBooking;
  /** Minutes since midnight. */
  start: number;
  /** Minutes since midnight; the caller has already applied its own end/fallback rules. */
  end: number;
}

export interface CalendarBookingCluster {
  /**
   * The earliest-starting segment. It is the React key, the tap target (its
   * detail sheet lists the whole visit), and the row whose status and arrival
   * state colour the bar — matching the web, which takes its palette from
   * `first`.
   */
  lead: CalendarGridBooking;
  /** Every segment, ordered by start then id. One entry for a standalone booking. */
  bookings: CalendarGridBooking[];
  /** Every segment's id. Quick actions fan out across these (web parity). */
  ids: string[];
  /** Earliest start, in minutes since midnight. */
  start: number;
  /** LATEST end across segments — see the note above on why not the last-starting one. */
  end: number;
  /** True when this bar stands for more than one booking. Such bars are not draggable. */
  isMultiSegment: boolean;
  /**
   * Service names joined with an arrow, mirroring the web's
   * `calendarMultiServiceDisplayTitle`. Not de-duplicated, also web parity: a
   * group of three all booking a Cut reads "Cut → Cut → Cut".
   */
  serviceLabel: string;
  /** Only when EVERY segment is settled — a part-paid visit is not paid. */
  paid: boolean;
}

/** A group id that actually groups: non-empty once trimmed. */
function groupKeyOf(booking: CalendarGridBooking): string | null {
  const raw = booking.group_booking_id?.trim();
  return raw ? raw : null;
}

function serviceLabelFor(bookings: CalendarGridBooking[]): string {
  return bookings
    .map((booking) => booking.serviceName?.trim())
    .filter((name): name is string => Boolean(name))
    .join(' → ');
}

function toCluster(segments: ClusterInput[]): CalendarBookingCluster {
  // Start order is the visit's order. Ties break on id so a group booked at one
  // time renders identically on every load rather than following row order.
  const sorted = [...segments].sort(
    (a, b) => a.start - b.start || a.booking.id.localeCompare(b.booking.id),
  );
  const bookings = sorted.map((segment) => segment.booking);
  return {
    lead: bookings[0]!,
    bookings,
    ids: bookings.map((booking) => booking.id),
    start: sorted[0]!.start,
    end: sorted.reduce((latest, segment) => Math.max(latest, segment.end), sorted[0]!.end),
    isMultiSegment: bookings.length > 1,
    serviceLabel: serviceLabelFor(bookings),
    paid: bookings.every((booking) => booking.payment_state === 'paid'),
  };
}

/**
 * One cluster per visit, in the order each visit first appears in `items`.
 *
 * A booking with no group id is its own cluster, as is a group with only one row
 * present — which happens routinely, because the caller has already applied the
 * status filter and the grid only ever holds one calendar's rows for one day.
 * Such a cluster reports `isMultiSegment: false` and behaves exactly as the
 * booking did before, drag included.
 */
export function clusterCalendarBookings(items: ClusterInput[]): CalendarBookingCluster[] {
  const byGroup = new Map<string, ClusterInput[]>();
  for (const item of items) {
    const key = groupKeyOf(item.booking);
    if (!key) continue;
    const existing = byGroup.get(key);
    if (existing) existing.push(item);
    else byGroup.set(key, [item]);
  }

  const emitted = new Set<string>();
  const clusters: CalendarBookingCluster[] = [];
  for (const item of items) {
    const key = groupKeyOf(item.booking);
    const segments = key ? byGroup.get(key) : undefined;
    // Alone in its group here: nothing to merge, so treat it as a plain booking.
    if (!key || !segments || segments.length <= 1) {
      clusters.push(toCluster([item]));
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    clusters.push(toCluster(segments));
  }
  return clusters;
}
