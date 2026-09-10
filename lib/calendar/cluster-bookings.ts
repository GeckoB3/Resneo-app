/**
 * One calendar bar per booking row, with what a row of a visit needs to say so.
 *
 * Until web #187 the grid MERGED the rows sharing a `group_booking_id` — a
 * multi-service visit or a party — into one bar spanning the lot. The services
 * of a visit are independent now (each has its own day, calendar, length and
 * Start / Complete), so the web draws one bar per service, and so does the app.
 * What still says "these belong together" is identity rather than geometry:
 * a chip on every bar ("1/2"), each bar in its own status colour, and a spine
 * across the seam where two meet — see `visit-siblings.ts`.
 *
 * The cluster shape survives (one booking per cluster) so the grids, the tray
 * targets and the drag keep their plumbing: `lead` is the booking, `ids` is
 * `[lead.id]`, and `visit` says where the row stands in its visit, or null.
 */

import { visitSiblingIndex, type VisitPosition } from '@/lib/calendar/visit-siblings';
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
  /** The booking this bar stands for: the React key, the tap target, the tray's row. */
  lead: CalendarGridBooking;
  /** Always one entry since web #187; kept as a list for the tray-target and drag plumbing. */
  bookings: CalendarGridBooking[];
  /** `[lead.id]`. */
  ids: string[];
  /** Start, in minutes since midnight. */
  start: number;
  end: number;
  /** Always false since web #187: a bar never stands for more than one booking. */
  isMultiSegment: boolean;
  /** The shared `group_booking_id`, when this row has one. */
  groupBookingId: string | null;
  /**
   * Always false since web #187 (a bar is never a whole visit). Kept so the
   * grids' drag gate reads the same; the row's own movability decides.
   */
  isVisit: boolean;
  /** The row's own status: the bar's colour, tray and drag gate. */
  status: string;
  /**
   * Where this row stands in its visit on this grid, or null for an ordinary
   * booking, a party's row, or a lone service whose siblings are elsewhere.
   * The chip, the shared palette and the seam spine all come from this.
   */
  visit: VisitPosition | null;
  /** The row's own service name. */
  serviceLabel: string;
  /** The row is settled. */
  paid: boolean;
}

/** A group id that actually groups: non-empty once trimmed. */
function groupKeyOf(booking: CalendarGridBooking): string | null {
  const raw = booking.group_booking_id?.trim();
  return raw ? raw : null;
}

/**
 * One cluster per booking, in input order, each carrying its place in its
 * visit (`visitSiblingIndex` over every row handed in, so a visit split across
 * the grid's columns still counts every service on screen). Pass `siblings`
 * to count across a wider set than `items` — the multi-calendar grid positions
 * one column at a time but the chip should count the whole day.
 */
export function clusterCalendarBookings(
  items: ClusterInput[],
  siblings?: Map<string, VisitPosition>,
): CalendarBookingCluster[] {
  const positions = siblings ?? visitSiblingIndex(items.map((item) => item.booking));
  return items.map(({ booking, start, end }) => ({
    lead: booking,
    bookings: [booking],
    ids: [booking.id],
    start,
    end,
    isMultiSegment: false,
    groupBookingId: groupKeyOf(booking),
    isVisit: false,
    status: booking.status,
    visit: positions.get(booking.id) ?? null,
    serviceLabel: booking.serviceName?.trim() ?? '',
    paid: booking.payment_state === 'paid',
  }));
}
