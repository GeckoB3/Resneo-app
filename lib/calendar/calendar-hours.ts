/**
 * What hours one CALENDAR works on one date.
 *
 * Port of web's `src/lib/availability/calendar-hours.ts`, which exists because six
 * separate implementations of working-hours-to-minutes had drifted apart. The
 * app needs the same answer for a different reason: the diary has to draw the
 * time a calendar is closed, and it must agree with the server that decides
 * whether a booking may go there.
 *
 * Three inputs, in precedence order:
 *
 * 1. A per-date override (`unified_calendars.availability_exceptions`, keyed
 *    "YYYY-MM-DD") REPLACES the weekly shape — `{closed:true}` shuts the day,
 *    `{periods:[…]}` becomes the day's hours. An override carrying no valid
 *    period is IGNORED rather than treated as a closure: an empty override is
 *    invalid data, not an intent (web §2.2, both layers).
 * 2. `days_off` shuts the day. Entries are either an exact ISO date or a
 *    recurring lowercase weekday name (`"mon"`); both are live in stored data,
 *    and the engines honour both, so the diary must too.
 * 3. The weekly shape for the date: a covering schedule period's week
 *    (`unified_calendars.schedule_periods`, or the older `working_hours_rota`
 *    while the timeline is null — see `working-hours-rota`), else the ordinary
 *    `working_hours` template, keyed "0"–"6" (Sun–Sat) or "sun"–"sat". Same
 *    precedence as web's `calendarHours`: below overrides and days off.
 *
 * Breaks are NOT part of this: the diary already draws them from the same
 * practitioner record, and they answer a different question (skippable with
 * `allow_during_breaks`, where hours are skippable with `allow_outside_hours`).
 * Leave is not here either — it is a hard closure the venue cannot work past,
 * and it lives in its own feed.
 */

import { timeToMinutes } from '@/components/calendar/grid-layout';
import { effectiveWorkingHoursForDate, scheduleForRow } from '@/lib/calendar/working-hours-rota';

export type MinuteRange = { start: number; end: number };

/** Per-date override, as `availability_exceptions` stores it. */
export type CalendarDateOverride =
  | { closed: true }
  | { periods: { start: string; end: string }[] }
  | Record<string, unknown>;

/**
 * The fields this layer reads. Structural rather than a named row type, because
 * the same shape arrives as a practitioner, as a resource's host calendar, and
 * as a raw `unified_calendars` row — all three must resolve identically.
 */
export interface CalendarScheduleRow {
  working_hours?: Record<string, { start: string; end: string }[]> | null;
  days_off?: string[] | null;
  availability_exceptions?: Record<string, CalendarDateOverride> | null;
  /**
   * Hours planned ahead or on a rota, and the older single-rota form read as a
   * fallback. Both come straight off the practitioners feed as `unknown` and are
   * parsed per call, so stored garbage degrades to "no periods".
   */
  schedule_periods?: unknown;
  working_hours_rota?: unknown;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function dayKeys(dateStr: string): { key: string; name: string } | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(y, m - 1, d).getDay();
  return { key: String(dow), name: DAY_NAMES[dow]! };
}

/** Merge overlapping/abutting ranges so a day's hours are one tidy set. */
export function unionRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: MinuteRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function toRanges(raw: { start: string; end: string }[] | null | undefined): MinuteRange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
}

/** The per-date override for this calendar, if it has one. */
export function calendarDateOverride(
  row: CalendarScheduleRow,
  dateStr: string,
): CalendarDateOverride | null {
  const raw = row.availability_exceptions;
  if (!raw || typeof raw !== 'object') return null;
  return raw[dateStr] ?? null;
}

/** True when `days_off` marks this date, as an ISO date or a weekday name. */
export function calendarDayOff(row: CalendarScheduleRow, dateStr: string): boolean {
  if (!Array.isArray(row.days_off)) return false;
  const keys = dayKeys(dateStr);
  return row.days_off.some((d) => d === dateStr || (keys != null && d === keys.name));
}

/**
 * Working ranges for this calendar on this date, before breaks.
 *
 * An empty result means "not working at all today", which the diary draws as a
 * full-day closed band. That is different from a calendar with no `working_hours`
 * configured at all — see {@link calendarHasWeeklyTemplate}, which the caller
 * uses to avoid greying a column whose hours were simply never set up.
 */
export function calendarHours(row: CalendarScheduleRow, dateStr: string): MinuteRange[] {
  const override = calendarDateOverride(row, dateStr);
  if (override && 'closed' in override && override.closed === true) return [];
  if (override && 'periods' in override) {
    const periods = toRanges(override.periods as { start: string; end: string }[]);
    if (periods.length > 0) return unionRanges(periods);
  }

  if (calendarDayOff(row, dateStr)) return [];

  // A schedule period supplies the weekly shape for the dates it covers; outside
  // every period the ordinary `working_hours` apply. Reading the base template
  // here was why a rota week greyed the wrong hours (R23-2).
  const hours = effectiveWorkingHoursForDate(row, dateStr);
  const keys = dayKeys(dateStr);
  if (!keys) return [];
  return unionRanges(toRanges(hours[keys.key] ?? hours[keys.name]));
}

/**
 * Whether this calendar has a weekly template at all.
 *
 * A calendar with none is unconstrained rather than closed — the venue has not
 * described its week — so the diary leaves it unshaded instead of greying every
 * hour of every day. Matches how the venue layer treats unconfigured
 * `opening_hours` as `unknown`.
 */
export function calendarHasWeeklyTemplate(row: CalendarScheduleRow): boolean {
  if (weeklyShapeHasHours(row.working_hours)) return true;
  // A calendar whose base week is empty but whose schedule has hours HAS been
  // described — its closed days are a statement, not an unset template.
  const schedule = scheduleForRow(row);
  return schedule?.periods.some((p) => p.weeks.some(weeklyShapeHasHours)) ?? false;
}

function weeklyShapeHasHours(hours: unknown): boolean {
  if (!hours || typeof hours !== 'object') return false;
  return Object.values(hours as Record<string, unknown>).some((v) => Array.isArray(v) && v.length > 0);
}

/**
 * Whether this date's hours come from a per-date override rather than the
 * weekly shape — the diary marks those "Amended hours" so staff can see the day
 * was deliberately changed rather than assume the template.
 */
export function calendarHasAmendedHours(row: CalendarScheduleRow, dateStr: string): boolean {
  const override = calendarDateOverride(row, dateStr);
  if (!override) return false;
  if ('closed' in override && override.closed === true) return false;
  if (!('periods' in override)) return false;
  return toRanges(override.periods as { start: string; end: string }[]).length > 0;
}
