/**
 * Which segments a quick-action press on a calendar bar actually has to write.
 *
 * A bar can stand for several bookings — a multi-service visit or a party sharing
 * a `group_booking_id` (see `clusterCalendarBookings`) — and a tray press applies
 * to the visit: Confirm, Arrived, Cancel and No-Show are facts about one client's
 * appointment, and every segment not already there is written. Start and Complete
 * are facts about ONE service (web #187, `visit-status.ts`): a colour can be
 * finished while the cut has not begun. On a visit bar they therefore target the
 * service the press means — Start the next service not yet begun, Complete the
 * one(s) in progress, Undo start the one(s) in progress, Reopen the last one
 * finished — never the whole bar.
 *
 * These return the whole id LIST so the caller can act on it as one bar action.
 * They deliberately do not fire anything per segment: the screen sends the
 * requests concurrently and then reconciles ONCE, because each `invalidateQueries`
 * cancels any in-flight refetch and starts a new one (`cancelRefetch` defaults to
 * true), so invalidating per segment restarted the calendar's own refetch once per
 * service and the bar sat waiting through every restart.
 */
import { isServiceLevelStatus, isTerminalVisitStatus } from '@/lib/booking/visit-status';
import type { CalendarBookingCluster } from '@/lib/calendar/cluster-bookings';

/** Segments a status press must write. */
export function statusChangeTargets(
  cluster: CalendarBookingCluster,
  status: string,
): string[] {
  const fromServiceLevel = isServiceLevelStatus(cluster.status);
  if (cluster.isVisit && (isServiceLevelStatus(status) || fromServiceLevel)) {
    // `bookings` is in start order, so "next" and "last" read off the list.
    const live = cluster.bookings.filter((b) => !isTerminalVisitStatus(b.status));
    if (status === 'Completed') {
      // Complete what is in progress; failing that, the next service not done.
      const seated = live.filter((b) => b.status === 'Seated');
      if (seated.length > 0) return seated.map((b) => b.id);
      const next = live.find((b) => b.status !== 'Completed');
      return next ? [next.id] : [];
    }
    if (status === 'Seated') {
      if (cluster.status === 'Completed') {
        // Reopen: the last service finished.
        const finished = live.filter((b) => b.status === 'Completed');
        const last = finished[finished.length - 1];
        return last ? [last.id] : [];
      }
      // Start: the next service not yet begun.
      const next = live.find((b) => b.status !== 'Seated' && b.status !== 'Completed');
      return next ? [next.id] : [];
    }
    if (fromServiceLevel) {
      // Undo start (Seated back to Booked/Confirmed): the service(s) in progress.
      return live.filter((b) => b.status === 'Seated').map((b) => b.id);
    }
  }
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
