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
  calendarHasWeeklyTemplate,
  calendarHours,
  unionRanges,
  type CalendarScheduleRow,
  type MinuteRange,
} from '@/lib/calendar/calendar-hours';

/**
 * Block types this module emits. All are read-only overlays. No band for
 * amended hours (web retired its own): the grid follows the resolved hours,
 * so the open part of an amended day looks like any other working day —
 * see `column-day-hours.ts`.
 *
 * The builder emits the first two. The other three come out of
 * {@link partitionClosureBands}, which the grids run over the venue's closed
 * minutes and the calendar's, so no minute carries two explanations (web
 * `partitionScheduleClosureBlocks`, 2026-09-10):
 *
 *  - `venue_closed` — the business is shut, the calendar would work;
 *  - `practitioner_closed` — the business is open, the calendar is not working;
 *  - `venue_and_calendar_closed` — both;
 *  - `linked_venue_closed` — a partner venue's own closed hours, on its column.
 */
export type ScheduleClosureBlockType =
  | 'practitioner_closed'
  | 'practitioner_leave'
  | 'venue_closed'
  | 'venue_and_calendar_closed'
  | 'linked_venue_closed';

export interface ScheduleClosureOverlay {
  id: string;
  /** HH:mm */
  start: string;
  end: string;
  label: string;
  isEditable: false;
  blockType: ScheduleClosureBlockType;
  /**
   * For `practitioner_leave` only: the word the team chose for this closure
   * (see {@link leaveBandLabel}), carried separately from `label` so the grid
   * can re-add the minutes without parsing the words back out.
   */
  leaveLabel?: string | null;
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
  /** `annual` | `sick` | `other` — the "Label (optional)" field on the editor. */
  leave_type?: string | null;
}

/**
 * The word a leave band shows, from the label the team picked when they made
 * the closure: "Closed", "Unavailable", or "Other" on both the app's
 * availability list and the web's editor, which calls the field "Label".
 *
 * Every band used to read "On leave" whatever was chosen — so a day entered as
 * **Closed**, and listed as "Staff 1 · Closed", appeared on the diary as "On
 * leave 09:00 to 22:00" (device test, 2026-09-12). A label the product asks for
 * and then discards is worse than no label at all.
 *
 * "Other" is the one choice that says nothing on a band, so it keeps the old
 * default: a stripe reading "Other 09:00 to 22:00" would explain less than "On
 * leave". Web still labels every leave band "On leave"
 * (`src/lib/calendar/schedule-closure-blocks.ts`) — a copy divergence, raised
 * with them; don't undo it without fixing the promise at the other end.
 */
export function leaveBandLabel(leaveType: string | null | undefined): string {
  if (leaveType === 'annual') return 'Closed';
  if (leaveType === 'sick') return 'Unavailable';
  return 'On leave';
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
): { fullDay: boolean; partial: MinuteRange[]; note: string | null; leaveType: string | null } {
  let fullDay = false;
  let note: string | null = null;
  // The first covering row's label speaks for the day. Two leave periods on one
  // date is already unusual; two with different labels has no single answer,
  // and picking the first keeps it the one the reader sees listed first.
  let leaveType: string | null = null;
  const partial: MinuteRange[] = [];

  for (const row of leavePeriods) {
    if (row.practitioner_id !== calendarId) continue;
    if (dateStr < row.start_date || dateStr > row.end_date) continue;
    if (note == null && row.notes?.trim()) note = row.notes.trim();
    if (leaveType == null && row.leave_type) leaveType = row.leave_type;
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

  return { fullDay, partial: unionRanges(partial), note, leaveType };
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
  leaveLabel?: string,
): ScheduleClosureOverlay {
  return {
    id: `${blockType}:${calendarId}:${dateStr}:${range.start}-${range.end}`,
    start: minutesToTime(range.start),
    end: minutesToTime(range.end),
    label,
    isEditable: false,
    blockType,
    ...(leaveLabel ? { leaveLabel } : {}),
  };
}

/**
 * The closed / leave bands for one calendar on one date, over the WHOLE day.
 *
 * They used to be clipped to the venue's open window, because the venue's shut
 * hours were shaded separately and a second band over the same minutes said
 * nothing new. Since the web's 2026-09-10 stripes each minute must say exactly
 * why it is unavailable — venue shut, calendar not working, or both — so the
 * calendar's bands now cover the day and the grid partitions them against the
 * venue's closed minutes ({@link partitionClosureBands}). The grid clips the
 * result to its visible window.
 */
export function buildCalendarClosureOverlays(params: {
  calendarId: string;
  dateStr: string;
  calendar: CalendarScheduleRow | null | undefined;
  leavePeriods: readonly LeavePeriodInput[];
}): ScheduleClosureOverlay[] {
  const { calendarId, dateStr, calendar, leavePeriods } = params;

  const window: MinuteRange[] = [{ start: DAY_START, end: DAY_END }];

  const leave = leaveForCalendarOnDate(calendarId, dateStr, leavePeriods);
  const out: ScheduleClosureOverlay[] = [];

  // Leave first: it says WHY the column is empty, and a day off would only say
  // the same thing less usefully. Web makes the same call.
  if (leave.fullDay) {
    // The stripe says only that the calendar is closed, in the words the team
    // chose; the grid relabels it with its own minutes
    // (`scheduleClosureBlockLabel`). The note is left off, as on the web, whose
    // leave blocks carry `reason: null`.
    const label = leaveBandLabel(leave.leaveType);
    for (const range of window) {
      out.push(overlay('practitioner_leave', calendarId, dateStr, range, label, label));
    }
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
    const label = leaveBandLabel(leave.leaveType);
    for (const range of intersect(leave.partial, intersect(working, window))) {
      out.push(overlay('practitioner_leave', calendarId, dateStr, range, label, label));
    }
  }

  return out;
}

/**
 * Whether a block is a synthetic closure band rather than something booked.
 *
 * Two callers, both in the grids: these must not widen the measured day (a
 * full-day band would drag the window out to 23:59), and they render as tinted
 * bands rather than as the bordered "Blocked" box a manual block gets. The two
 * amended-hours names are no longer emitted but stay recognised, so a stale
 * band in a cached feed still cannot widen the day.
 */
export function isScheduleClosureBlockType(blockType: string | null | undefined): boolean {
  return (
    blockType === 'practitioner_closed' ||
    blockType === 'practitioner_leave' ||
    blockType === 'calendar_amended_hours' ||
    blockType === 'venue_closed' ||
    blockType === 'venue_amended_hours' ||
    blockType === 'venue_and_calendar_closed' ||
    blockType === 'linked_venue_closed'
  );
}

function hm(t: string): string {
  return t.slice(0, 5);
}

/**
 * The words on a closure stripe (web `scheduleClosureBlockLabel`). Every
 * stripe says why the minutes are unavailable and which minutes: "Venue closed
 * 18:00 to 20:00" when the calendar would work but the business is shut,
 * "Hannah unavailable 08:00 to 09:00" when the business is open but the
 * calendar is not working, "Hannah closed 08:00 to 09:00" when both apply
 * (the calendar's own closure is what keeps those minutes shut, so it is
 * named rather than a bare "Closed").
 */
export function scheduleClosureBlockLabel(
  blockType: string | null | undefined,
  opts?: {
    columnName?: string | null;
    startTime?: string;
    endTime?: string;
    /** The leave band's own word ({@link leaveBandLabel}); "On leave" if absent. */
    leaveLabel?: string | null;
  },
): string {
  const range = opts?.startTime && opts?.endTime ? ` ${hm(opts.startTime)} to ${hm(opts.endTime)}` : '';
  if (blockType === 'practitioner_leave') {
    return `${opts?.leaveLabel?.trim() || 'On leave'}${range}`;
  }
  if (blockType === 'venue_closed') return `Venue closed${range}`;
  if (blockType === 'practitioner_closed') {
    const who = opts?.columnName?.trim() || 'Calendar';
    return `${who} unavailable${range}`;
  }
  if (blockType === 'linked_venue_closed') return `Linked venue closed${range}`;
  if (blockType === 'venue_and_calendar_closed') {
    const who = opts?.columnName?.trim() || 'Calendar';
    return `${who} closed${range}`;
  }
  return `Closed${range}`;
}

/** Remove `cuts` from `ranges`; a cut through the middle splits a range in two. */
function subtractRanges(ranges: MinuteRange[], cuts: MinuteRange[]): MinuteRange[] {
  let out = unionRanges(ranges);
  for (const cut of unionRanges(cuts)) {
    const next: MinuteRange[] = [];
    for (const r of out) {
      if (cut.end <= r.start || cut.start >= r.end) {
        next.push(r);
        continue;
      }
      if (cut.start > r.start) next.push({ start: r.start, end: cut.start });
      if (cut.end < r.end) next.push({ start: cut.end, end: r.end });
    }
    out = next;
  }
  return out;
}

/** A band the grids draw: the block, and its minutes already clipped to the window. */
export interface ClosureBandEntry<T> {
  block: T;
  start: number;
  end: number;
}

/**
 * One explanation per minute (web `partitionScheduleClosureBlocks`).
 *
 * Takes the venue's closed minutes for the column (from `venueClosedRanges`,
 * already clipped to the grid window) and the column's overlays (already
 * clamped), and returns the bands to draw in their place:
 *
 *  - minutes only the venue is shut → `venue_closed` (`linked_venue_closed` on
 *    a partner's column, where the "venue" is theirs);
 *  - minutes only the calendar is off → `practitioner_closed`, kept from the
 *    builder's band but relabelled with the column's name and the range;
 *  - minutes both apply → `venue_and_calendar_closed`.
 *
 * Leave bands pass through whole (relabelled with their minutes), and so do
 * breaks, manual blocks and a partner's busy time. Leave is deliberately NOT
 * clipped to the venue's open hours: it is the one band the drag treats as a
 * wall, so hiding it over the venue's shut minutes would make a drop there
 * look allowed when the server refuses it.
 */
export function partitionClosureBands<
  T extends { id: string; blockType?: string | null; label?: string | null; leaveLabel?: string | null },
>(
  params: {
    venueClosed: readonly MinuteRange[];
    entries: readonly ClosureBandEntry<T>[];
    columnName?: string | null;
    /** The venue's closed minutes belong to a partner venue (its own column). */
    linked?: boolean;
    /** Namespaces the synthetic bands' ids (one column and date). */
    keyPrefix: string;
  },
): ClosureBandEntry<T | ScheduleClosureOverlay>[] {
  const { venueClosed, entries, columnName, linked = false, keyPrefix } = params;
  const venue = unionRanges([...venueClosed]);
  const calendar: MinuteRange[] = [];
  const passthrough: ClosureBandEntry<T | ScheduleClosureOverlay>[] = [];
  for (const entry of entries) {
    if (entry.block.blockType === 'practitioner_closed') {
      calendar.push({ start: entry.start, end: entry.end });
    } else if (entry.block.blockType === 'practitioner_leave') {
      // Leave passes through whole, as on the web: over the venue's shut hours
      // too, where it keeps being the wall the drag refuses (a person on leave
      // is not in the building, whatever the venue's hours say). It is drawn
      // after the venue stripes, so it covers them. Relabelled with its own
      // minutes, the web's "On leave 09:00 to 17:00".
      const startTime = minutesToTime(entry.start);
      const endTime = minutesToTime(entry.end);
      passthrough.push({
        block: {
          ...entry.block,
          label: scheduleClosureBlockLabel('practitioner_leave', {
            startTime,
            endTime,
            leaveLabel: entry.block.leaveLabel,
          }),
        },
        start: entry.start,
        end: entry.end,
      });
    } else {
      passthrough.push(entry);
    }
  }

  const band = (
    blockType: ScheduleClosureBlockType,
    r: MinuteRange,
  ): ClosureBandEntry<ScheduleClosureOverlay> => {
    const start = minutesToTime(r.start);
    const end = minutesToTime(r.end);
    return {
      block: {
        id: `${blockType}:${keyPrefix}:${r.start}-${r.end}`,
        start,
        end,
        label: scheduleClosureBlockLabel(blockType, { columnName, startTime: start, endTime: end }),
        isEditable: false,
        blockType,
      },
      start: r.start,
      end: r.end,
    };
  };

  const out: ClosureBandEntry<T | ScheduleClosureOverlay>[] = [];
  const venueType: ScheduleClosureBlockType = linked ? 'linked_venue_closed' : 'venue_closed';
  for (const r of subtractRanges(venue, calendar)) out.push(band(venueType, r));
  for (const r of subtractRanges(calendar, venue)) out.push(band('practitioner_closed', r));
  for (const r of intersect(venue, calendar)) out.push(band('venue_and_calendar_closed', r));
  return [...out, ...passthrough];
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
