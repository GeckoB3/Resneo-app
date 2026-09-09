/**
 * Which status changes belong to a whole multi-service visit, and which to one
 * service — and what a visit's status IS once its services differ.
 *
 * Ported from web `src/lib/booking/visit-status-scope.ts` and
 * `visitLifecycleStatus` in `src/lib/booking/group-visit-bookings.ts` (#187,
 * Docs/visit-services-independent-plan.md). Confirming, marking arrived,
 * cancelling and a no-show are facts about the visit: one client, one
 * appointment in their diary, and `PATCH /api/venue/bookings/[id]` still
 * cascades them across the rows. Starting and completing are facts about a
 * service — a colour can be finished while the cut has not begun — and the
 * server now writes those to ONE row. Every surface that shows or changes a
 * visit's status consults these.
 */

/** Lifecycle statuses that belong to one service rather than the visit. */
const SERVICE_LEVEL_STATUSES: ReadonlySet<string> = new Set(['Seated', 'Completed']);

const VISIT_TERMINAL_STATUSES: ReadonlySet<string> = new Set(['Cancelled', 'No-Show']);

const VISIT_STATUS_RANK: Record<string, number> = {
  Pending: 0,
  'Deposit Pending': 0,
  Booked: 1,
  Confirmed: 2,
  Arrived: 2,
  Seated: 3,
  Started: 3,
  Completed: 4,
  'No-Show': 5,
  Cancelled: 6,
};

/**
 * True when moving `previous` to `next` is written to every service of the
 * visit. Forward to Confirmed cascades, and so does its undo. Anything into or
 * out of Seated or Completed is one service's: Start, Complete, Undo start and
 * Undo complete.
 */
export function statusChangeCascadesAcrossVisit(previous: string, next: string): boolean {
  if (SERVICE_LEVEL_STATUSES.has(next)) return false;
  if (SERVICE_LEVEL_STATUSES.has(previous)) return false;
  return true;
}

/** True when the status is one a single service carries on its own. */
export function isServiceLevelStatus(status: string | null | undefined): boolean {
  return status != null && SERVICE_LEVEL_STATUSES.has(status);
}

/** A row that is not happening: it neither holds the visit back nor counts toward it. */
export function isTerminalVisitStatus(status: string | null | undefined): boolean {
  return status != null && VISIT_TERMINAL_STATUSES.has(status);
}

/**
 * The visit's overall state, derived from its rows: Completed when every live
 * service is Completed, Seated when any is, otherwise the earliest stage among
 * them. With no live row, the anchor's own status (or the first row's).
 */
export function visitLifecycleStatus(
  rows: readonly { status?: string | null }[],
  anchorStatus?: string | null,
): string {
  const live = rows.filter((r) => r.status && !isTerminalVisitStatus(r.status));
  if (live.length === 0) return anchorStatus ?? rows[0]?.status ?? 'Booked';
  if (live.every((r) => r.status === 'Completed')) return 'Completed';
  if (live.some((r) => r.status === 'Seated' || r.status === 'Started')) return 'Seated';
  let earliest: string | null = null;
  for (const r of live) {
    const status = r.status!;
    if (status === 'Completed') continue; // a finished service does not hold the visit back
    const rank = VISIT_STATUS_RANK[status] ?? -1;
    if (earliest == null || rank < (VISIT_STATUS_RANK[earliest] ?? -1)) earliest = status;
  }
  return earliest ?? 'Completed';
}
