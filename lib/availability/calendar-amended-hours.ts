/**
 * Amended hours for one calendar: "on these dates this calendar works these
 * hours" (web #187, `Docs/calendar-amended-hours-plan.md`).
 *
 * The store is `unified_calendars.availability_exceptions`, the per-date map
 * `calendarHours` already reads FIRST (an hours override replaces the weekly
 * shape, the schedule period and `days_off`; leave still wins). The web writes
 * it through `/api/venue/calendar-amended-hours` (GET runs in a window, PUT a
 * range with periods, DELETE a range); this is the pure half the app's editor
 * needs: the wire shapes, the client-side validation the route repeats, the
 * date arithmetic, and the two notes the form shows before a save.
 */

import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { resolveVenueDay, type VenueWideBlock } from '@/lib/calendar/venue-closures';
import type { OpeningHours } from '@/types/venue';

/** The route refuses more dates than this in one save. */
export const AMENDED_HOURS_MAX_DATES = 92;
export const AMENDED_HOURS_MAX_REASON_LENGTH = 200;
/** Periods the form offers (open, a break, open again). The route takes up to 6. */
export const AMENDED_HOURS_MAX_PERIODS = 3;

export interface HoursPeriod {
  /** HH:mm */
  start: string;
  end: string;
}

/** One run of consecutive dates carrying the same override, as GET lists it. */
export interface AmendedHoursEntry {
  kind: 'hours' | 'closed';
  date_start: string;
  date_end: string;
  periods: HoursPeriod[];
  reason: string | null;
  calendar_id: string;
  calendar_name: string;
}

/** PUT body: set the hours for every date in the range on one calendar, or every active one. */
export interface PutAmendedHoursInput {
  practitioner_id?: string;
  apply_to_all_active?: boolean;
  date_start: string;
  date_end: string;
  periods: HoursPeriod[];
  reason?: string | null;
  /** The run being edited; its keys go first so shortening a run leaves no stragglers. */
  replace?: { date_start: string; date_end: string } | null;
}

const HHMM = /^\d{2}:\d{2}$/;

export function enumerateDatesInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    if (cur === to) break;
    cur = addDaysToDateStr(cur, 1);
  }
  return out;
}

function hmToMinutes(hm: string): number {
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
}

export function minutesToHm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Periods as the form holds them, normalised to what is stored: `HH:mm`,
 * `end > start`, sorted, overlapping or touching periods merged. The route runs
 * the same rule; doing it here means the refusal reads in the form, not as a
 * 400. An empty result is refused: an override with no periods is invalid
 * data, not an intent to close.
 */
export function normaliseHoursPeriods(
  raw: readonly HoursPeriod[],
): { ok: true; periods: HoursPeriod[] } | { ok: false; error: string } {
  if (raw.length === 0) return { ok: false, error: 'Enter at least one open and close time.' };
  const ranges: { start: number; end: number }[] = [];
  for (const p of raw) {
    const start = p.start.trim().slice(0, 5);
    const end = p.end.trim().slice(0, 5);
    if (!HHMM.test(start) || !HHMM.test(end)) return { ok: false, error: 'Times must be in HH:mm form.' };
    const s = hmToMinutes(start);
    const e = hmToMinutes(end);
    if (e <= s) {
      return { ok: false, error: `Close time must be after open time (${start} to ${end}).` };
    }
    ranges.push({ start: s, end: e });
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return { ok: true, periods: merged.map((r) => ({ start: minutesToHm(r.start), end: minutesToHm(r.end) })) };
}

/** A leave row as the practitioner-leave feed lists it. */
export interface LeaveLike {
  practitioner_id?: string;
  start_date: string;
  end_date: string;
  unavailable_start_time?: string | null;
  unavailable_end_time?: string | null;
}

export function isFullDayLeave(l: Pick<LeaveLike, 'unavailable_start_time' | 'unavailable_end_time'>): boolean {
  return !l.unavailable_start_time || !l.unavailable_end_time;
}

/** The first date in the range on which `leave` closes the whole day, or null. */
export function firstFullDayLeaveDate(
  dateStart: string,
  dateEnd: string,
  leave: readonly LeaveLike[],
): string | null {
  const fullDay = leave.filter(isFullDayLeave);
  if (fullDay.length === 0) return null;
  for (const date of enumerateDatesInclusive(dateStart, dateEnd)) {
    if (fullDay.some((l) => l.start_date <= date && date <= l.end_date)) return date;
  }
  return null;
}

/** "Mon 21 Sep" or "Mon 21 Sep – Fri 25 Sep". */
export function describeAmendedRange(dateStart: string, dateEnd: string): string {
  const a = formatDayHeading(dateStart);
  const b = formatDayHeading(dateEnd);
  return a === b ? a : `${a} – ${b}`;
}

/** "09:00–13:00, 14:00–17:00" */
export function describeHoursPeriods(periods: readonly HoursPeriod[]): string {
  return periods.map((p) => `${p.start}–${p.end}`).join(', ');
}

/**
 * The leave already on the calendar inside the range, for the note under the
 * form. Full-day leave BLOCKS the save (the route refuses it: leave is hard
 * and outranks hours, so the override would save and do nothing there);
 * part-day leave is named and stays blocked inside the amended hours.
 */
export function amendedHoursLeaveNote(args: {
  dateStart: string;
  dateEnd: string;
  leave: readonly LeaveLike[];
  calendarName: string;
}): { blocking: boolean; text: string } | null {
  if (!args.dateStart || !args.dateEnd || args.dateEnd < args.dateStart) return null;
  const overlapping = args.leave.filter(
    (l) => l.start_date <= args.dateEnd && l.end_date >= args.dateStart,
  );
  const full = overlapping.find(isFullDayLeave);
  if (full) {
    const first = enumerateDatesInclusive(args.dateStart, args.dateEnd).find(
      (d) => full.start_date <= d && d <= full.end_date,
    );
    return {
      blocking: true,
      text: `${args.calendarName} is closed all day on ${formatDayHeading(first ?? full.start_date)}. Remove that closure first, or shorten the range.`,
    };
  }
  const partial = overlapping.find((l) => !isFullDayLeave(l));
  if (partial) {
    const days =
      partial.start_date === partial.end_date
        ? formatDayHeading(partial.start_date)
        : `${formatDayHeading(partial.start_date)} to ${formatDayHeading(partial.end_date)}`;
    return {
      blocking: false,
      text: `${args.calendarName} is unavailable ${partial.unavailable_start_time!.slice(0, 5)} to ${partial.unavailable_end_time!.slice(0, 5)} on ${days}. That window stays blocked inside the amended hours.`,
    };
  }
  return null;
}

/**
 * The venue's side of an amended day, for the note under the form. A calendar
 * only sells where its hours fall inside the venue's resolved hours, so opening
 * a calendar on a day the venue is closed, or past its close, lets staff book
 * and shows guests nothing until the venue's own closures amend that date too.
 * Saving is still allowed: the weekly editor allows the same, and the note is
 * what turns a surprise into a choice.
 */
export function amendedHoursVenueNote(args: {
  dateStart: string;
  dateEnd: string;
  periods: readonly HoursPeriod[];
  venueHours: OpeningHours | null | undefined;
  venueBlocks: readonly VenueWideBlock[];
}): string | null {
  if (!args.dateStart || !args.dateEnd || args.dateEnd < args.dateStart) return null;
  if (!args.venueHours || typeof args.venueHours !== 'object' || Object.keys(args.venueHours).length === 0) {
    return null;
  }
  const periods = args.periods
    .filter((p) => HHMM.test(p.start) && HHMM.test(p.end))
    .map((p) => ({ start: hmToMinutes(p.start), end: hmToMinutes(p.end) }))
    .filter((r) => r.end > r.start);
  if (periods.length === 0) return null;
  const dates = enumerateDatesInclusive(args.dateStart, args.dateEnd).slice(0, AMENDED_HOURS_MAX_DATES);
  const closedDates: string[] = [];
  let outside: { date: string; venue: string } | null = null;
  for (const date of dates) {
    const venue = resolveVenueDay(args.venueHours, date, [...args.venueBlocks]).hours;
    if (venue.kind === 'closed') {
      closedDates.push(date);
      continue;
    }
    if (venue.kind !== 'open') continue;
    const fits = periods.every((p) => venue.periods.some((v) => p.start >= v.start && p.end <= v.end));
    if (!fits && !outside) {
      outside = {
        date,
        venue: venue.periods.map((r) => `${minutesToHm(r.start)} to ${minutesToHm(r.end)}`).join(', '),
      };
    }
  }
  const parts: string[] = [];
  if (closedDates.length === 1) {
    parts.push(`Your venue is closed on ${formatDayHeading(closedDates[0]!)}, so guests cannot book this calendar that day.`);
  } else if (closedDates.length > 1) {
    parts.push(
      `Your venue is closed on ${closedDates.length} of these dates (first ${formatDayHeading(closedDates[0]!)}), so guests cannot book this calendar on them.`,
    );
  }
  if (outside) {
    parts.push(`Hours outside ${outside.venue} on ${formatDayHeading(outside.date)} are not bookable by guests.`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(' ')} Staff can still book. To open to guests as well, amend your business hours for these dates too (Settings → Business hours).`;
}

/**
 * True when a stored `closed` override covers the date. The hours form never
 * writes one (closures are leave), but older rows carry them and every engine
 * honours them, so the month grid draws the day as closed (web parity).
 */
export function amendedClosedOnDate(
  entries: readonly AmendedHoursEntry[],
  date: string,
  calendarId?: string | null,
): boolean {
  return entries.some(
    (e) =>
      e.kind === 'closed' &&
      e.date_start <= date &&
      date <= e.date_end &&
      (!calendarId || e.calendar_id === calendarId),
  );
}

/** The hours entry covering a date on a calendar, if any. */
export function amendedHoursOnDate(
  entries: readonly AmendedHoursEntry[],
  date: string,
  calendarId?: string | null,
): AmendedHoursEntry | null {
  return (
    entries.find(
      (e) =>
        e.kind === 'hours' &&
        e.date_start <= date &&
        date <= e.date_end &&
        (!calendarId || e.calendar_id === calendarId),
    ) ?? null
  );
}
