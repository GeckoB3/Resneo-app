/**
 * Collapse multi-service visits in the bookings list to a single representative
 * row, so one guest with several consecutive services shows as one bar instead
 * of N near-identical rows.
 *
 * Ported from web `src/lib/booking/booking-list-row-schedule.ts`
 * (`collapseMultiServiceVisits` / `isMultiServiceVisitGroup`) to keep the mobile
 * list at parity. The only adaptation is `booking_time` being nullable on the
 * mobile `BookingListRow` (the web seed types it as a required string) — nulls
 * sort to the start so the earliest-start segment is still chosen.
 *
 * The detail surface already renders the per-segment "Services in this visit"
 * card (`useGroupVisit` + `GroupVisitCards`), so the representative row keeps
 * opening the same `BookingDetailSheet`.
 */

/** Minimal row shape the collapse logic reads — the list row is a superset. */
export interface MultiServiceCollapseRow {
  id: string;
  booking_time?: string | null;
  group_booking_id?: string | null;
  person_label?: string | null;
}

/**
 * A consecutive multi-service visit: several rows sharing a `group_booking_id`
 * with NO per-person `person_label` (one guest, back-to-back services). A group
 * booking — distinct people, each carrying a `person_label` — returns false so
 * it is NOT collapsed and still renders as separate bars.
 */
export function isMultiServiceVisitGroup(
  rows: Array<Pick<MultiServiceCollapseRow, 'person_label'>>,
): boolean {
  if (rows.length <= 1) return false;
  return rows.every((r) => !r.person_label?.trim());
}

/** Earliest start wins as the representative; nullable times sort first. */
function compareStart(a: MultiServiceCollapseRow, b: MultiServiceCollapseRow): number {
  return (a.booking_time ?? '').localeCompare(b.booking_time ?? '');
}

/**
 * Reduce multi-service visits (shared `group_booking_id`, no per-person label)
 * to a single representative row — the earliest-start segment. Group bookings
 * (people with `person_label`) and standalone bookings are returned untouched.
 * Order is otherwise preserved; the original array is returned by reference when
 * there is nothing to collapse.
 */
export function collapseMultiServiceVisits<T extends MultiServiceCollapseRow>(rows: T[]): T[] {
  const byGroup = new Map<string, T[]>();
  for (const row of rows) {
    const gid = row.group_booking_id?.trim();
    if (!gid) continue;
    const list = byGroup.get(gid) ?? [];
    list.push(row);
    byGroup.set(gid, list);
  }

  /** group_booking_id -> id of the single representative row kept for the visit. */
  const representativeId = new Map<string, string>();
  for (const [gid, group] of byGroup) {
    if (!isMultiServiceVisitGroup(group)) continue;
    const earliest = [...group].sort(compareStart)[0]!;
    representativeId.set(gid, earliest.id);
  }

  if (representativeId.size === 0) return rows;

  return rows.filter((row) => {
    const gid = row.group_booking_id?.trim();
    if (!gid) return true;
    const repId = representativeId.get(gid);
    // Not a multi-service visit (group booking / single) → keep every row.
    if (!repId) return true;
    // Multi-service visit → keep only the representative.
    return row.id === repId;
  });
}
