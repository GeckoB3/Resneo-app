/**
 * The synthetic overlays that make a closed diary look closed.
 *
 * The app's calendar grid is fed by `GET /api/venue/calendar-grid`, which
 * returns bookings, `calendar_blocks` rows and sessions — and nothing else. So
 * three kinds of unavailability were invisible on the diary while the booking
 * engine enforced all three:
 *
 *  - venue closures and amended hours (`availability_blocks`), handled in
 *    `venue-closures.ts` because they change what the grid shades venue-wide;
 *  - a calendar not working — its weekly hours, a `days_off` date, or a per-date
 *    override — which no feed expressed at all;
 *  - staff leave (`practitioner_leave_periods`), which the grid does not read.
 *
 * Staff look at this screen to find space for an appointment. A column that
 * renders identically whether the person is working or on annual leave answers
 * that question wrongly, which is the whole reason web draws the same bands
 * (`src/lib/calendar/schedule-closure-blocks.ts`, ported here).
 *
 * ## Why leave and "not working" are different types
 *
 * They used to be one on web and were split (SA-M28): leave is a person being
 * absent, and out-of-hours is a boundary the venue may choose to work past.
 * That difference decides whether the drag treats the band as a wall — see
 * `occupying-blocks.ts`, where `practitioner_leave` occupies and
 * `practitioner_closed` does not.
 *
 * ## Full-day bands carry real clock times
 *
 * A full-day closure is emitted as `00:00`–`23:59` and the grid clips it to the
 * visible window. It must NOT widen that window, so the grids exclude closure
 * types when measuring their bounds — the same "an output cannot be an input"
 * rule web hit when its generated stripes dragged the grid back out to 22:00.
 */

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import {
  calendarHasAmendedHours,
  calendarHasWeeklyTemplate,
  calendarHours,
  unionRanges,
  type CalendarScheduleRow,
  type MinuteRange,
} from '@/lib/calendar/calendar-hours';

/** Block types this module emits. All are read-only overlays. */
export type ScheduleClosureBlockType =
  | 'practitioner_closed'
  | 'practitioner_leave'
  | 'calendar_amended_hours';

export interface ScheduleClosureOverlay {
  id: string;
  /** HH:mm */
  start: string;
  end: string;
  label: string;
  isEditable: false;
  blockType: ScheduleClosureBlockType;
}

/** A row from `GET /api/venue/practitioner-leave`. */
export interface LeavePeriodInput {
  id?: string;
  practitioner_id: string;
  start_date: string;
  end_date: string;
  unavailable_start_time?: string | null;
  unavailable_end_time?: string | null;
  notes?: string | null;
}

const DAY_START = 0;
const DAY_END = 24 * 60 - 1; // 23:59 — a band, not a boundary, so it stays on the day

function isFullDayLeave(row: LeavePeriodInput): boolean {
  return (
    (row.unavailable_start_time == null || row.unavailable_start_time === '') &&
    (row.unavailable_end_time == null || row.unavailable_end_time === '')
  );
}

/** Leave covering this calendar on this date, split into full-day and partial. */
export function leaveForCalendarOnDate(
  calendarId: string,
  dateStr: string,
  leavePeriods: readonly LeavePeriodInput[],
): { fullDay: boolean; partial: MinuteRange[]; note: string | null } {
  let fullDay = false;
  let note: string | null = null;
  const partial: MinuteRange[] = [];

  for (const row of leavePeriods) {
    if (row.practitioner_id !== calendarId) continue;
    if (dateStr < row.start_date || dateStr > row.end_date) continue;
    if (note == null && row.notes?.trim()) note = row.notes.trim();
    if (isFullDayLeave(row)) {
      fullDay = true;
      continue;
    }
    const start = timeToMinutes(row.unavailable_start_time!.slice(0, 5));
    const end = timeToMinutes(row.unavailable_end_time!.slice(0, 5));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      partial.push({ start, end });
    }
  }

  return { fullDay, partial: unionRanges(partial), note };
}

/** Complement of `open` within [boundsStart, boundsEnd] — the closed gaps. */
function complement(open: MinuteRange[], boundsStart: number, boundsEnd: number): MinuteRange[] {
  if (boundsEnd <= boundsStart) return [];
  const sorted = unionRanges(open);
  const out: MinuteRange[] = [];
  let cursor = boundsStart;
  for (const r of sorted) {
    if (r.start > cursor) out.push({ start: cursor, end: Math.min(r.start, boundsEnd) });
    cursor = Math.max(cursor, r.end);
    if (cursor >= boundsEnd) break;
  }
  if (cursor < boundsEnd) out.push({ start: cursor, end: boundsEnd });
  return out.filter((r) => r.end > r.start);
}

function intersect(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const ra of a) {
    for (const rb of b) {
      const start = Math.max(ra.start, rb.start);
      const end = Math.min(ra.end, rb.end);
      if (start < end) out.push({ start, end });
    }
  }
  return unionRanges(out);
}

function overlay(
  blockType: ScheduleClosureBlockType,
  calendarId: string,
  dateStr: string,
  range: MinuteRange,
  label: string,
): ScheduleClosureOverlay {
  return {
    id: `${blockType}:${calendarId}:${dateStr}:${range.start}-${range.end}`,
    start: minutesToTime(range.start),
    end: minutesToTime(range.end),
    label,
    isEditable: false,
    blockType,
  };
}

/**
 * The closed / leave / amended bands for one calendar on one date.
 *
 * `venueOpenRanges` is what the venue itself allows that day. Non-working time
 * is drawn only INSIDE it, because the hours a venue is shut are already shaded
 * venue-wide: without that clip every column would carry a second, darker band
 * over the same minutes. Pass an empty array when the venue imposes no hours,
 * and the whole day is used instead.
 */
export function buildCalendarClosureOverlays(params: {
  calendarId: string;
  dateStr: string;
  calendar: CalendarScheduleRow | null | undefined;
  leavePeriods: readonly LeavePeriodInput[];
  venueOpenRanges: readonly MinuteRange[];
}): ScheduleClosureOverlay[] {
  const { calendarId, dateStr, calendar, leavePeriods, venueOpenRanges } = params;

  const window: MinuteRange[] =
    venueOpenRanges.length > 0
      ? unionRanges([...venueOpenRanges])
      : [{ start: DAY_START, end: DAY_END }];

  const leave = leaveForCalendarOnDate(calendarId, dateStr, leavePeriods);
  const out: ScheduleClosureOverlay[] = [];

  // Leave first: it says WHY the column is empty, and a day off would only say
  // the same thing less usefully. Web makes the same call.
  if (leave.fullDay) {
    const label = leave.note ? `On leave — ${leave.note}` : 'On leave';
    for (const range of window) out.push(overlay('practitioner_leave', calendarId, dateStr, range, label));
    return out;
  }

  const working = calendar ? calendarHours(calendar, dateStr) : [];
  const hasTemplate = calendar ? calendarHasWeeklyTemplate(calendar) : false;

  if (working.length === 0) {
    // No hours today. Only shade it when the calendar HAS a weekly shape —
    // otherwise this is a column nobody has set up, and greying every hour of
    // every day would be a statement the venue never made.
    if (hasTemplate) {
      for (const range of window) {
        out.push(overlay('practitioner_closed', calendarId, dateStr, range, 'Closed'));
      }
    }
  } else {
    for (const range of intersect(complement(working, DAY_START, DAY_END), window)) {
      out.push(overlay('practitioner_closed', calendarId, dateStr, range, 'Closed'));
    }
  }

  // Partial leave, clipped to the hours actually worked. Two non-overlapping
  // sets rather than one merged band, so "on leave 2–4" stays distinguishable
  // from "does not work Wednesday afternoons".
  if (leave.partial.length > 0 && working.length > 0) {
    const label = leave.note ? `On leave — ${leave.note}` : 'On leave';
    for (const range of intersect(leave.partial, intersect(working, window))) {
      out.push(overlay('practitioner_leave', calendarId, dateStr, range, label));
    }
  }

  // An amended day is marked so staff can see the hours were deliberately
  // changed for this date rather than assume the weekly template.
  if (calendar && working.length > 0 && calendarHasAmendedHours(calendar, dateStr)) {
    for (const range of intersect(working, window)) {
      out.push(overlay('calendar_amended_hours', calendarId, dateStr, range, 'Amended hours'));
    }
  }

  return out;
}

/**
 * Whether a block is a synthetic closure band rather than something booked.
 *
 * Two callers, both in the grids: these must not widen the measured day (a
 * full-day band would drag the window out to 23:59), and they render as tinted
 * bands rather than as the bordered "Blocked" box a manual block gets.
 */
export function isScheduleClosureBlockType(blockType: string | null | undefined): boolean {
  return (
    blockType === 'practitioner_closed' ||
    blockType === 'practitioner_leave' ||
    blockType === 'calendar_amended_hours' ||
    blockType === 'venue_closed' ||
    blockType === 'venue_amended_hours'
  );
}

/**
 * Clip synthetic closure bands to the grid's visible window, dropping any that
 * fall entirely outside it.
 *
 * Full-day closures and leave carry real clock times (00:00–23:59) and are
 * excluded when the grid measures its day. Without this they would then render
 * from a negative offset and run far past the last hour line. Everything else
 * is returned untouched.
 */
export function clampClosureBlocksToWindow<T extends { blockType?: string | null }>(
  entries: { block: T; start: number; end: number }[],
  windowStartMin: number,
  windowEndMin: number,
): { block: T; start: number; end: number }[] {
  const out: { block: T; start: number; end: number }[] = [];
  for (const entry of entries) {
    if (!isScheduleClosureBlockType(entry.block.blockType)) {
      out.push(entry);
      continue;
    }
    const start = Math.max(entry.start, windowStartMin);
    const end = Math.min(entry.end, windowEndMin);
    if (end > start) out.push({ block: entry.block, start, end });
  }
  return out;
}
