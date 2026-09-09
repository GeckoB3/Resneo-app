/**
 * A multi-service visit on the diary, drawn as one bar per service (web #187,
 * `src/lib/calendar/visit-siblings.ts`).
 *
 * Services of a visit are independent rows: each has its own bar, grip, tray
 * and drag. What still says "these belong together" is identity rather than
 * geometry: a chip on every bar ("Visit 1/2"), the earliest service's colour
 * shared by all of them, and a short spine across the seam where two of them
 * meet edge to edge in one column. This module is the pure part: which rows
 * form a visit, their order, and whether a moved service lands on one of its
 * own siblings.
 *
 * The grid holds one day, so rows carry no date here; a service of the visit
 * on another day is simply not counted, which is the honest answer for a chip
 * drawn from what is on screen.
 */

export interface VisitSiblingRow {
  id: string;
  group_booking_id?: string | null;
  /** Set on a multi-PERSON party, which shares a group id but is not a visit. */
  person_label?: string | null;
  /** HH:mm */
  startTime: string;
  status: string;
}

export interface VisitPosition {
  groupId: string;
  /** 0-based place among the visit's live services on this grid, by start. */
  index: number;
  count: number;
  /** The earliest live service: the one whose colour the whole visit takes. */
  anchorId: string;
}

const TERMINAL = new Set(['Cancelled', 'No-Show']);

function isVisitRow(row: VisitSiblingRow): boolean {
  return Boolean(row.group_booking_id?.trim()) && !row.person_label?.trim();
}

function startKey(row: VisitSiblingRow): string {
  return `${row.startTime.slice(0, 5)}#${row.id}`;
}

/**
 * Where each row stands in its visit, for every row that is one live service
 * of a visit with at least two live services in `rows`.
 */
export function visitSiblingIndex(rows: readonly VisitSiblingRow[]): Map<string, VisitPosition> {
  const byGroup = new Map<string, VisitSiblingRow[]>();
  for (const row of rows) {
    if (!isVisitRow(row) || TERMINAL.has(row.status)) continue;
    const gid = row.group_booking_id!.trim();
    const list = byGroup.get(gid) ?? [];
    list.push(row);
    byGroup.set(gid, list);
  }
  const out = new Map<string, VisitPosition>();
  for (const [groupId, list] of byGroup) {
    if (list.length < 2) continue;
    const ordered = [...list].sort((a, b) => startKey(a).localeCompare(startKey(b)));
    ordered.forEach((row, index) => {
      out.set(row.id, { groupId, index, count: ordered.length, anchorId: ordered[0]!.id });
    });
  }
  return out;
}

export function visitChipLabel(position: VisitPosition): string {
  return `Visit ${position.index + 1}/${position.count}`;
}

/**
 * Whether a service meets a sibling of its own visit edge to edge in the same
 * column: `top` when a sibling ends exactly where this one starts, `bottom`
 * when one starts exactly where this one ends. The grid draws a short spine
 * across each such seam, so two touching bars read as one booking without
 * merging them.
 */
export function visitTouchingEdges(params: {
  row: VisitSiblingRow;
  rows: readonly VisitSiblingRow[];
  /** The row's column; every row of `rows` is compared on the same key. */
  columnIdOf: (row: VisitSiblingRow) => string | null;
  /** Minutes the row occupies on the grid, from its start. */
  spanMinutesOf: (row: VisitSiblingRow) => number;
  toMinutes: (hhmm: string) => number;
}): { top: boolean; bottom: boolean } {
  const gid = params.row.group_booking_id?.trim();
  const out = { top: false, bottom: false };
  if (!gid || !isVisitRow(params.row) || TERMINAL.has(params.row.status)) return out;
  const column = params.columnIdOf(params.row);
  const start = params.toMinutes(params.row.startTime.slice(0, 5));
  const end = start + params.spanMinutesOf(params.row);
  for (const other of params.rows) {
    if (other.id === params.row.id) continue;
    if (other.group_booking_id?.trim() !== gid || TERMINAL.has(other.status)) continue;
    if (params.columnIdOf(other) !== column) continue;
    const s = params.toMinutes(other.startTime.slice(0, 5));
    const e = s + params.spanMinutesOf(other);
    if (e === start) out.top = true;
    if (s === end) out.bottom = true;
  }
  return out;
}

/**
 * How many of a service's own siblings the window `[startMin, endMin)` on
 * `columnId` would overlap. A visit's services may overlap each other, and
 * staff may do it on purpose, but it is never silent.
 */
export function ownSiblingOverlapCount(params: {
  moved: Pick<VisitSiblingRow, 'id' | 'group_booking_id'>;
  startMin: number;
  endMin: number;
  columnId: string | null;
  rows: readonly VisitSiblingRow[];
  columnIdOf: (row: VisitSiblingRow) => string | null;
  spanMinutesOf: (row: VisitSiblingRow) => number;
  toMinutes: (hhmm: string) => number;
}): number {
  const gid = params.moved.group_booking_id?.trim();
  if (!gid) return 0;
  let count = 0;
  for (const row of params.rows) {
    if (row.id === params.moved.id) continue;
    if (row.group_booking_id?.trim() !== gid || TERMINAL.has(row.status)) continue;
    if (params.columnIdOf(row) !== params.columnId) continue;
    const s = params.toMinutes(row.startTime.slice(0, 5));
    const e = s + params.spanMinutesOf(row);
    if (params.startMin < e && s < params.endMin) count += 1;
  }
  return count;
}
