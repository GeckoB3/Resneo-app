/**
 * Which bookings a quick-action press on a calendar bar actually has to write.
 *
 * Since web #187 a bar stands for ONE booking row (`clusterCalendarBookings`
 * no longer merges a visit), so a press writes that row: the server cascades
 * Confirm, Arrived, Cancel and No-show across the visit itself, and writes
 * Start and Complete to the one service (`visit-status.ts`). A row already in
 * the target state is skipped, so a press that changes nothing costs no
 * request and no refetch.
 *
 * These return an id LIST so the screen keeps acting on it as one bar action:
 * it sends the requests concurrently and reconciles ONCE, because each
 * `invalidateQueries` cancels any in-flight refetch and starts a new one.
 */
import type { CalendarBookingCluster } from '@/lib/calendar/cluster-bookings';

/** Bookings a status press must write — those not already at `status`. */
export function statusChangeTargets(
  cluster: CalendarBookingCluster,
  status: string,
): string[] {
  return cluster.bookings.filter((b) => b.status !== status).map((b) => b.id);
}

/** Bookings an arrival toggle must write — those not already at `arrived`. */
export function arrivalToggleTargets(
  cluster: CalendarBookingCluster,
  arrived: boolean,
): string[] {
  return cluster.bookings
    .filter((b) => Boolean(b.client_arrived_at) !== arrived)
    .map((b) => b.id);
}
