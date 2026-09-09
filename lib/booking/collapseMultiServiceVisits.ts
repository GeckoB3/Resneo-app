/**
 * Collapse multi-service visits in the bookings list to a single representative
 * row per DAY, so one guest with several services shows as one line instead of
 * N near-identical rows.
 *
 * Ported from web `src/lib/booking/booking-list-row-schedule.ts`
 * (`collapseMultiServiceVisits` / `isMultiServiceVisitGroup`, web #187). Since
 * the services of a visit are independent, each keeps its own date, so a visit
 * split across days shows one line on each of them; and Start and Complete are
 * per service, so the line carries the visit's DERIVED status rather than
 * whatever the earliest row happens to be at. The only adaptation is
 * `booking_time` being nullable on the mobile `BookingListRow` — nulls sort to
 * the start so the earliest-start segment is still chosen.
 *
 * The detail surface already renders the per-segment "Services in this visit"
 * card (`useGroupVisit` + `GroupVisitCards`), so the representative row keeps
 * opening the same `BookingDetailSheet`.
 */

import { visitLifecycleStatus } from '@/lib/booking/visit-status';

/** Minimal row shape the collapse logic reads — the list row is a superset. */
export interface MultiServiceCollapseRow {
  id: string;
  booking_time?: string | null;
  /** Each service of a visit has its own date; a line stands for the services on its day. */
  booking_date?: string | null;
  group_booking_id?: string | null;
  person_label?: string | null;
  status?: string;
}

/** Marks on a list line that stands for part of a visit. */
export interface VisitListLineMarks {
  /**
   * Set on a line whose visit has other services on another day in view: the
   * rest of the visit is elsewhere in the list, and the line says so.
   */
  visit_spans_days?: boolean;
  /**
   * Set on a lone service of a visit whose other services are not in view on
   * any day (cancelled, filtered out, or on a hidden calendar).
   */
  visit_rest_hidden?: boolean;
}

/**
 * A multi-service visit: several rows sharing a `group_booking_id` with NO
 * per-person `person_label` (one guest, several services). A group booking —
 * distinct people, each carrying a `person_label` — returns false so it is NOT
 * collapsed and still renders as separate bars.
 */
export function isMultiServiceVisitGroup(
  rows: Pick<MultiServiceCollapseRow, 'person_label'>[],
): boolean {
  if (rows.length <= 1) return false;
  return rows.every((r) => !r.person_label?.trim());
}

/** Earliest start wins as the representative; nullable times sort first. */
function compareStart(a: MultiServiceCollapseRow, b: MultiServiceCollapseRow): number {
  return (a.booking_time ?? '').localeCompare(b.booking_time ?? '');
}

/**
 * Reduce each day of a multi-service visit (shared `group_booking_id`, no
 * per-person label) to a single representative row — the earliest-start segment
 * of that day, carrying the visit's derived status. Group bookings (people with
 * `person_label`) and standalone bookings are returned untouched. Order is
 * otherwise preserved; the original array is returned by reference when there
 * is nothing to collapse or mark.
 */
export function collapseMultiServiceVisits<T extends MultiServiceCollapseRow>(
  rows: T[],
): (T & VisitListLineMarks)[] {
  const dayKey = (row: T) => `${row.group_booking_id!.trim()}::${row.booking_date ?? ''}`;
  const byGroupDay = new Map<string, T[]>();
  const daysByGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    const gid = row.group_booking_id?.trim();
    if (!gid) continue;
    const key = dayKey(row);
    const list = byGroupDay.get(key) ?? [];
    list.push(row);
    byGroupDay.set(key, list);
    const days = daysByGroup.get(gid) ?? new Set<string>();
    days.add(row.booking_date ?? '');
    daysByGroup.set(gid, days);
  }

  /** group::day -> id of the single representative row kept for that day of the visit. */
  const representativeId = new Map<string, string>();
  for (const [key, group] of byGroupDay) {
    if (!isMultiServiceVisitGroup(group)) continue;
    const earliest = [...group].sort(compareStart)[0]!;
    representativeId.set(key, earliest.id);
  }

  let touched = false;
  const out = rows.flatMap((row): (T & VisitListLineMarks)[] => {
    const gid = row.group_booking_id?.trim();
    if (!gid) return [row];
    const key = dayKey(row);
    const repId = representativeId.get(key);
    if (!repId) {
      /**
       * A lone service of a visit: nothing else of the visit is on this day in
       * view. A party's rows arrive here too and are left alone; only a service
       * of a visit is marked (a standalone booking never carries a group id).
       */
      const group = byGroupDay.get(key) ?? [row];
      const loneVisitService = group.length === 1 && !row.person_label?.trim();
      if (!loneVisitService) return [row];
      touched = true;
      const otherDayInView = (daysByGroup.get(gid)?.size ?? 1) > 1;
      return [
        otherDayInView ? { ...row, visit_spans_days: true } : { ...row, visit_rest_hidden: true },
      ];
    }
    touched = true;
    // Multi-service day: keep only the representative.
    if (row.id !== repId) return [];
    const spansDays = (daysByGroup.get(gid)?.size ?? 1) > 1;
    const group = byGroupDay.get(key) ?? [row];
    const status =
      typeof row.status === 'string' ? visitLifecycleStatus(group, row.status) : row.status;
    return [
      {
        ...row,
        ...(typeof status === 'string' ? { status } : {}),
        ...(spansDays ? { visit_spans_days: true } : {}),
      },
    ];
  });

  return touched ? out : rows;
}
