/**
 * A multi-service visit on the diary, drawn as one bar per service (web #187,
 * `src/lib/calendar/visit-siblings.ts`).
 *
 * Services of a visit are independent rows: each has its own bar, grip, tray
 * and drag. What still says "these belong together" is identity rather than
 * geometry: a chip on every bar ("1/2", web #189), and a short spine across the
 * seam where two of them meet edge to edge in one column. Each bar wears its
 * OWN status colour (app `ff7bc42`, web #190): a finished colour is green while
 * the cut that has not begun stays booked. This module is the pure part: which rows
 * form a visit, their order, and whether a moved service lands on one of its
 * own siblings.
 *
 * Rows are grouped by visit key (`visitKeyOf`, split-visit plan 8.2), so a
 * party's rows, a class cart and resource rows never chip. A row may carry its
 * date: the week view counts a visit's services across the days it shows, and
 * orders them by date, then start. The day grids hand in one day, where a
 * service of the visit on another day is simply not counted, which is the
 * honest answer for a chip drawn from what is on screen.
 */

import { visitKeyOf } from '@/lib/booking/visit-key';
import type { CalendarGridCalendar, CalendarGridBooking } from '@/types/calendar-grid';

export interface VisitSiblingRow {
  id: string;
  group_booking_id?: string | null;
  linked_visit_id?: string | null;
  /** Set on a multi-PERSON party, which shares a group id but is not a visit. */
  person_label?: string | null;
  /** Set on a class cart row, which shares a group id but is not a visit. */
  class_instance_id?: string | null;
  /** YYYY-MM-DD, when the rows handed in cover more than one day. */
  date?: string | null;
  /** HH:mm */
  startTime: string;
  status: string;
}

export interface VisitPosition {
  /** The visit's key (`visitKeyOf`): the group id, or the link across businesses. */
  groupId: string;
  /** 0-based place among the visit's live services on this grid, by date then start. */
  index: number;
  count: number;
  /** The earliest live service. */
  anchorId: string;
}

const TERMINAL = new Set(['Cancelled', 'No-Show']);

/** The row's visit key, or null for a row that is not one service of a visit. */
export function siblingVisitKey(row: VisitSiblingRow): string | null {
  return visitKeyOf(row)?.trim() || null;
}

function startKey(row: VisitSiblingRow): string {
  return `${row.date ?? ''}T${row.startTime.slice(0, 5)}#${row.id}`;
}

/**
 * Where each row stands in its visit, for every row that is one live service
 * of a visit with at least two live services in `rows`.
 *
 * Pass every row the grid holds, not only the columns on screen (split-visit
 * plan G15): a visit's services can sit on columns the filter hides, and the
 * chip on the one that is shown still says "1/2".
 */
export function visitSiblingIndex(
  rows: readonly VisitSiblingRow[],
  /**
   * The other businesses' services of visits across businesses this person may see (web split-visit
   * plan 7.2, `/api/venue/visits/partner-lines`), by link. They count in the chip ("1/2" for one own
   * service and one at another business); one the grid already holds is counted once.
   */
  partners: ReadonlyMap<string, readonly VisitPartnerSibling[]> = new Map(),
): Map<string, VisitPosition> {
  const byVisit = new Map<string, VisitSiblingRow[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (TERMINAL.has(row.status) || seen.has(row.id)) continue;
    const key = siblingVisitKey(row);
    if (!key) continue;
    seen.add(row.id);
    const list = byVisit.get(key) ?? [];
    list.push(row);
    byVisit.set(key, list);
  }
  const out = new Map<string, VisitPosition>();
  for (const [groupId, list] of byVisit) {
    const onGrid = new Set(list.map((r) => r.id));
    const extra: VisitSiblingRow[] = (partners.get(groupId) ?? [])
      .filter((p) => !onGrid.has(p.booking_id) && !TERMINAL.has(p.status))
      .map((p) => ({ id: p.booking_id, date: p.booking_date, startTime: p.start_time, status: p.status }));
    const all = [...list, ...extra];
    if (all.length < 2) continue;
    const ordered = [...all].sort((a, b) => startKey(a).localeCompare(startKey(b)));
    ordered.forEach((row, index) => {
      if (!onGrid.has(row.id)) return;
      out.set(row.id, { groupId, index, count: ordered.length, anchorId: ordered[0]!.id });
    });
  }
  return out;
}

/** Another business's service of a visit across businesses, as the chip counts it. */
export interface VisitPartnerSibling {
  booking_id: string;
  booking_date: string;
  /** HH:MM */
  start_time: string;
  status: string;
}

export function visitChipLabel(position: VisitPosition): string {
  // "1/2", not "Visit 1/2" (web #189): the bar already shows the service name
  // and the word said nothing the spine and the hover do not.
  return `${position.index + 1}/${position.count}`;
}

/**
 * The rows a grid's chips count (split-visit plan G15): every booking the
 * calendar grid holds on `dates`, on every calendar, whether or not its column
 * is drawn, plus any rows from elsewhere (a partner's bars on linked columns).
 */
export function gridVisitSiblingRows(
  calendars: readonly CalendarGridCalendar[],
  dates: readonly string[],
  extra: readonly VisitSiblingRow[] = [],
): VisitSiblingRow[] {
  const wanted = new Set(dates);
  const rows: VisitSiblingRow[] = [];
  for (const calendar of calendars) {
    for (const day of calendar.dates) {
      if (!wanted.has(day.date)) continue;
      for (const booking of day.bookings) rows.push(siblingRowOf(booking, day.date));
    }
  }
  return [...rows, ...extra];
}

/** A grid booking as a sibling row on `date`. */
export function siblingRowOf(booking: CalendarGridBooking, date: string | null): VisitSiblingRow {
  return {
    id: booking.id,
    group_booking_id: booking.group_booking_id ?? null,
    linked_visit_id: booking.linked_visit_id ?? null,
    person_label: booking.person_label ?? null,
    date,
    startTime: booking.startTime,
    status: booking.status,
  };
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
  const key = siblingVisitKey(params.row);
  const out = { top: false, bottom: false };
  if (!key || TERMINAL.has(params.row.status)) return out;
  const column = params.columnIdOf(params.row);
  const start = params.toMinutes(params.row.startTime.slice(0, 5));
  const end = start + params.spanMinutesOf(params.row);
  for (const other of params.rows) {
    if (other.id === params.row.id) continue;
    if (siblingVisitKey(other) !== key || TERMINAL.has(other.status)) continue;
    if ((other.date ?? null) !== (params.row.date ?? null)) continue;
    if (params.columnIdOf(other) !== column) continue;
    const s = params.toMinutes(other.startTime.slice(0, 5));
    const e = s + params.spanMinutesOf(other);
    if (e === start) out.top = true;
    if (s === end) out.bottom = true;
  }
  return out;
}

/**
 * The siblings of a service that the window `[startMin, endMin)` on `columnId`
 * would overlap (web `ownSiblingOverlaps`, split-visit plan G13 and G16): on the
 * same column (one person doing two services at once), and on other columns,
 * where the client would be in two places. A visit's services may overlap each
 * other, and staff may do it on purpose, but it is never silent.
 *
 * `rows` is one day, every column the grid holds. Siblings the grid does not
 * hold (a hidden calendar) are not seen here.
 */
export function ownSiblingOverlaps<T extends VisitSiblingRow>(params: {
  moved: Pick<VisitSiblingRow, 'id' | 'group_booking_id' | 'linked_visit_id' | 'person_label'>;
  startMin: number;
  endMin: number;
  columnId: string | null;
  rows: readonly T[];
  columnIdOf: (row: T) => string | null;
  /** Minutes the row occupies on the grid, from its start. */
  spanMinutesOf: (row: T) => number;
  toMinutes: (hhmm: string) => number;
}): { sameColumn: T[]; otherColumns: T[] } {
  const out = { sameColumn: [] as T[], otherColumns: [] as T[] };
  const key = siblingVisitKey({ ...params.moved, startTime: '', status: '' });
  if (!key) return out;
  for (const row of params.rows) {
    if (row.id === params.moved.id) continue;
    if (siblingVisitKey(row) !== key || TERMINAL.has(row.status)) continue;
    const s = params.toMinutes(row.startTime.slice(0, 5));
    const e = s + params.spanMinutesOf(row);
    if (!(params.startMin < e && s < params.endMin)) continue;
    if (params.columnIdOf(row) === params.columnId) out.sameColumn.push(row);
    else out.otherColumns.push(row);
  }
  return out;
}
