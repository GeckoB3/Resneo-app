/**
 * Which segments a quick-action press on a calendar bar actually has to write.
 *
 * A bar can stand for several bookings — a multi-service visit or a party sharing
 * a `group_booking_id` (see `clusterCalendarBookings`) — and a tray press applies
 * to all of them. Segments already in the target state are skipped: pressing
 * Complete on a visit whose first service is already Completed must not re-PATCH
 * that row.
 *
 * These return the whole id LIST so the caller can act on it as one bar action.
 * They deliberately do not fire anything per segment: the screen sends the
 * requests concurrently and then reconciles ONCE, because each `invalidateQueries`
 * cancels any in-flight refetch and starts a new one (`cancelRefetch` defaults to
 * true), so invalidating per segment restarted the calendar's own refetch once per
 * service and the bar sat waiting through every restart.
 */
import type { CalendarBookingCluster } from '@/lib/calendar/cluster-bookings';

/** Segments a status press must write — those not already at `status`. */
export function statusChangeTargets(
  cluster: CalendarBookingCluster,
  status: string,
): string[] {
  return cluster.bookings.filter((b) => b.status !== status).map((b) => b.id);
}

/** Segments an arrival toggle must write — those not already at `arrived`. */
export function arrivalToggleTargets(
  cluster: CalendarBookingCluster,
  arrived: boolean,
): string[] {
  return cluster.bookings
    .filter((b) => Boolean(b.client_arrived_at) !== arrived)
    .map((b) => b.id);
}
