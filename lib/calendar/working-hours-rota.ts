/**
 * Schedule periods: a calendar's working hours planned ahead as a timeline.
 *
 * Read-side port of web's `src/lib/availability/working-hours-rota.ts`
 * (resneo 7acff0ba). A period has a Monday start, an optional Sunday end and
 * one to six weekly shapes, each the same shape as `working_hours`. One week
 * means "these hours from this date"; two to six means a rota, where the week
 * for a date is the number of whole weeks since the period's `cycle_start`,
 * modulo the length. Dates no period covers keep the ordinary `working_hours`.
 *
 * `working_hours_rota` was the first, single-rota form; it is read as a
 * fallback only while `schedule_periods` is null (the server nulls it whenever
 * it writes the timeline).
 *
 * The diary draws a calendar's non-working time itself (`schedule-closures`),
 * and it must agree with the server about which week's hours apply; the
 * availability screen plans hours ahead with the same module (the insert,
 * trim, cycle and prune arithmetic under "Editing", ported 2026-09-06 with the
 * web's tests). Everything here is pure, timezone-free and tolerant of stored
 * garbage (malformed → "no periods", never a throw).
 */

export interface RotaTimeRange {
  start: string;
  end: string;
}

/** Keys "0"–"6" (Sun–Sat) or "sun"–"sat", exactly as `working_hours` is stored. */
export type RotaWeeklyHours = Record<string, RotaTimeRange[]>;

export const ROTA_MIN_WEEKS = 1;
export const ROTA_MAX_WEEKS = 6;
/** The most cycles "For N cycles" runs a change for (a year of weekly changes). */
export const ROTA_MAX_CYCLES = 52;
export const SCHEDULE_MAX_PERIODS = 50;

export interface SchedulePeriod {
  id: string;
  /** The Monday the period starts, `YYYY-MM-DD`. */
  from: string;
  /** The Sunday the period ends, inclusive; null means until further notice. */
  until: string | null;
  /** The Monday the week count runs from; equals `from` unless the period was split. */
  cycle_start: string;
  /** One to six weekly shapes, in cycle order. */
  weeks: RotaWeeklyHours[];
}

export interface CalendarSchedule {
  version: 1;
  /** Sorted by `from`, non-overlapping. */
  periods: SchedulePeriod[];
}

/** The first, single-rota shape; read as a fallback only. */
export interface WorkingHoursRota {
  version: 1;
  cycle_start: string;
  weeks: RotaWeeklyHours[];
  repeat_until: string | null;
}

export type ScheduleSource =
  | { kind: 'base' }
  | { kind: 'period'; period: SchedulePeriod; periodIndex: number; weekIndex: number };

export interface ScheduleResolution {
  hours: RotaWeeklyHours;
  source: ScheduleSource;
}

/** The fields the resolver reads — structural, so any calendar row fits. */
export interface ScheduleCarrier {
  working_hours?: RotaWeeklyHours | null;
  schedule_periods?: unknown;
  working_hours_rota?: unknown;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

// ── Dates (UTC arithmetic on calendar dates: no timezone can shift a YMD) ─────

export function isYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y!, m! - 1, d!));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m! - 1 && probe.getUTCDate() === d;
}

/** Whole days since the epoch for a calendar date, timezone-free. */
export function ymdToDayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

export function dayNumberToYmd(dayNumber: number): string {
  const date = new Date(dayNumber * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  return dayNumberToYmd(ymdToDayNumber(ymd) + days);
}

/** 0 = Sunday … 6 = Saturday, from the date alone. */
export function dayOfWeekYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export function isMondayYmd(ymd: string): boolean {
  return dayOfWeekYmd(ymd) === 1;
}

export function isSundayYmd(ymd: string): boolean {
  return dayOfWeekYmd(ymd) === 0;
}

/** The Monday on or before the date (the start of its Monday-to-Sunday week). */
export function mondayOnOrBefore(ymd: string): string {
  const dow = dayOfWeekYmd(ymd);
  return addDaysYmd(ymd, -(dow === 0 ? 6 : dow - 1));
}

/** The Sunday on or after the date (the end of its Monday-to-Sunday week). */
export function sundayOnOrAfter(ymd: string): string {
  const dow = dayOfWeekYmd(ymd);
  return addDaysYmd(ymd, dow === 0 ? 0 : 7 - dow);
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseWeek(raw: unknown): RotaWeeklyHours | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: RotaWeeklyHours = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DAY_KEYS.has(key)) return null;
    if (!Array.isArray(value)) return null;
    const ranges: RotaTimeRange[] = [];
    for (const r of value) {
      if (!r || typeof r !== 'object') return null;
      const { start, end } = r as { start?: unknown; end?: unknown };
      if (typeof start !== 'string' || typeof end !== 'string') return null;
      if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) return null;
      ranges.push({ start, end });
    }
    out[key] = ranges;
  }
  return out;
}

function parseWeeks(raw: unknown): RotaWeeklyHours[] | null {
  if (!Array.isArray(raw) || raw.length < ROTA_MIN_WEEKS || raw.length > ROTA_MAX_WEEKS) return null;
  const weeks: RotaWeeklyHours[] = [];
  for (const w of raw) {
    const week = parseWeek(w);
    if (!week) return null;
    weeks.push(week);
  }
  return weeks;
}

/**
 * Validate a stored schedule. Mirrors the server's validator (the same one its
 * PATCH route runs), so a record the server accepted resolves here and a record
 * it would refuse is treated as "no periods".
 */
export function validateCalendarSchedule(
  raw: unknown,
): { ok: true; schedule: CalendarSchedule } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'The schedule is not an object.' };
  }
  const src = raw as Record<string, unknown>;
  if (src.version !== 1) return { ok: false, error: 'Unknown schedule version.' };
  if (!Array.isArray(src.periods)) return { ok: false, error: 'The schedule has no periods list.' };
  if (src.periods.length > SCHEDULE_MAX_PERIODS) {
    return { ok: false, error: `A calendar can hold at most ${SCHEDULE_MAX_PERIODS} schedule periods.` };
  }
  const periods: SchedulePeriod[] = [];
  const ids = new Set<string>();
  for (const p of src.periods) {
    if (!p || typeof p !== 'object') return { ok: false, error: 'A schedule period is malformed.' };
    const item = p as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 64) {
      return { ok: false, error: 'A schedule period has no id.' };
    }
    if (ids.has(item.id)) return { ok: false, error: 'Two schedule periods share an id.' };
    ids.add(item.id);
    if (!isYmd(item.from) || !isMondayYmd(item.from)) {
      return { ok: false, error: 'A schedule period must start on a Monday.' };
    }
    let until: string | null = null;
    if (item.until != null) {
      if (!isYmd(item.until) || !isSundayYmd(item.until)) {
        return { ok: false, error: 'A schedule period must end on a Sunday.' };
      }
      if (ymdToDayNumber(item.until) < ymdToDayNumber(item.from)) {
        return { ok: false, error: 'A schedule period must end on or after it starts.' };
      }
      until = item.until;
    }
    const cycleStart = item.cycle_start == null ? item.from : item.cycle_start;
    if (
      !isYmd(cycleStart) ||
      !isMondayYmd(cycleStart) ||
      ymdToDayNumber(cycleStart) > ymdToDayNumber(item.from)
    ) {
      return { ok: false, error: 'A schedule period has an invalid cycle start.' };
    }
    const weeks = parseWeeks(item.weeks);
    if (!weeks) {
      return {
        ok: false,
        error: `A schedule period must have ${ROTA_MIN_WEEKS} to ${ROTA_MAX_WEEKS} weeks of valid hours.`,
      };
    }
    periods.push({ id: item.id, from: item.from, until, cycle_start: cycleStart, weeks });
  }
  periods.sort((a, b) => ymdToDayNumber(a.from) - ymdToDayNumber(b.from));
  for (let i = 1; i < periods.length; i += 1) {
    const prev = periods[i - 1]!;
    const next = periods[i]!;
    if (prev.until == null || ymdToDayNumber(prev.until) >= ymdToDayNumber(next.from)) {
      return { ok: false, error: 'Schedule periods must not overlap.' };
    }
  }
  return { ok: true, schedule: { version: 1, periods } };
}

/** A valid schedule, or null for anything else. */
export function parseCalendarSchedule(raw: unknown): CalendarSchedule | null {
  const result = validateCalendarSchedule(raw);
  return result.ok ? result.schedule : null;
}

/** The first, single-rota shape: valid record or null. Read as a fallback only. */
export function parseWorkingHoursRota(raw: unknown): WorkingHoursRota | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (src.version !== 1) return null;
  if (!isYmd(src.cycle_start) || !isMondayYmd(src.cycle_start)) return null;
  const weeks = parseWeeks(src.weeks);
  if (!weeks || weeks.length < 2) return null;
  let repeat_until: string | null = null;
  if (src.repeat_until != null) {
    if (!isYmd(src.repeat_until)) return null;
    if (ymdToDayNumber(src.repeat_until) < ymdToDayNumber(src.cycle_start)) return null;
    repeat_until = src.repeat_until;
  }
  return { version: 1, cycle_start: src.cycle_start, weeks, repeat_until };
}

/** The fallback form as a one-period timeline (the end moved to the Sunday that finishes its week). */
export function legacyRotaToSchedule(rota: WorkingHoursRota): CalendarSchedule {
  return {
    version: 1,
    periods: [
      {
        id: 'legacy-rota',
        from: rota.cycle_start,
        until: rota.repeat_until ? sundayOnOrAfter(rota.repeat_until) : null,
        cycle_start: rota.cycle_start,
        weeks: rota.weeks,
      },
    ],
  };
}

/** The timeline a calendar row carries: `schedule_periods`, else the older single rota, else none. */
export function scheduleForRow(row: ScheduleCarrier): CalendarSchedule | null {
  const periods = parseCalendarSchedule(row.schedule_periods);
  if (periods) return periods;
  if (row.schedule_periods == null) {
    const rota = parseWorkingHoursRota(row.working_hours_rota);
    if (rota) return legacyRotaToSchedule(rota);
  }
  return null;
}

// ── Resolution ────────────────────────────────────────────────────────────────

function periodCovers(period: SchedulePeriod, day: number): boolean {
  if (day < ymdToDayNumber(period.from)) return false;
  if (period.until != null && day > ymdToDayNumber(period.until)) return false;
  return true;
}

/** Which week of a period's cycle a date falls in (0-based); the caller checks coverage. */
export function weekIndexInPeriod(period: SchedulePeriod, dateYmd: string): number {
  const weeksSince = Math.floor((ymdToDayNumber(dateYmd) - ymdToDayNumber(period.cycle_start)) / 7);
  return ((weeksSince % period.weeks.length) + period.weeks.length) % period.weeks.length;
}

/**
 * The weekly shape that applies on a date and where it came from: the covering
 * period's week, or the base `working_hours`. The single place the choice is
 * made — the closure bands and the Availability screen both go through it.
 */
export function resolveScheduleForDate(row: ScheduleCarrier, dateYmd: string): ScheduleResolution {
  const base: RotaWeeklyHours = row.working_hours ?? {};
  if (!isYmd(dateYmd)) return { hours: base, source: { kind: 'base' } };
  const schedule = scheduleForRow(row);
  if (schedule) {
    const day = ymdToDayNumber(dateYmd);
    for (const [periodIndex, period] of schedule.periods.entries()) {
      if (!periodCovers(period, day)) continue;
      const weekIndex = weekIndexInPeriod(period, dateYmd);
      return {
        hours: period.weeks[weekIndex] ?? {},
        source: { kind: 'period', period, periodIndex, weekIndex },
      };
    }
  }
  return { hours: base, source: { kind: 'base' } };
}

export function effectiveWorkingHoursForDate(row: ScheduleCarrier, dateYmd: string): RotaWeeklyHours {
  return resolveScheduleForDate(row, dateYmd).hours;
}

// ── Describing (Availability screen) ──────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "7 Sep 2026", from the date alone (no locale, so the wording is the same on every device). */
export function describeYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[(m ?? 1) - 1]} ${y}`;
}

/** One line per period, worded as the web timeline lists them. */
export function describePeriod(p: SchedulePeriod): string {
  const pattern = p.weeks.length === 1 ? 'same hours every week' : `${p.weeks.length}-week rota`;
  const runs = p.until ? `until ${describeYmdShort(p.until)}` : 'until further notice';
  return `From ${describeYmdShort(p.from)}, ${runs}: ${pattern}`;
}

/** Which rule sets a date's hours, for the line under a calendar's summary. */
export function describeScheduleSource(source: ScheduleSource): string {
  if (source.kind !== 'period') return 'Standard weekly hours';
  const week =
    source.period.weeks.length > 1
      ? `, week ${source.weekIndex + 1} of ${source.period.weeks.length}`
      : '';
  return `Change from ${describeYmdShort(source.period.from)}${week}`;
}

/**
 * True once the period's last day is before `todayYmd`; an open-ended period
 * never ends. The web's schedule timeline lists the change running now and any
 * still to come, and moves ended ones behind "Show N past changes"
 * (2026-09-04); the app's read-only list does the same.
 */
export function schedulePeriodHasEnded(
  period: Pick<SchedulePeriod, 'until'>,
  todayYmd: string,
): boolean {
  return period.until != null && ymdToDayNumber(period.until) < ymdToDayNumber(todayYmd);
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "Monday 7 September 2026", from the date alone (web `describeYmd`; no locale, same on every device). */
export function describeYmdLong(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${WEEKDAYS_LONG[dayOfWeekYmd(ymd)]} ${d} ${MONTHS_LONG[(m ?? 1) - 1]} ${y}`;
}

// ── Editing (web `insertSchedulePeriod` and friends, ported with its tests) ──

/** A fresh period id (`sp-…`), as the web mints them. */
export function newSchedulePeriodId(): string {
  const random =
    typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `sp-${random}`;
}

/** The inclusive Sunday a period ends on when it runs for `cycles` full cycles from `from`. */
export function periodEndForCycles(from: string, weekCount: number, cycles: number): string {
  const safeCycles = Math.max(1, Math.min(ROTA_MAX_CYCLES, Math.floor(cycles)));
  return addDaysYmd(from, weekCount * safeCycles * 7 - 1);
}

/** Full cycles a period runs for when its end lands on a cycle boundary; null otherwise or when open-ended. */
export function periodCyclesForEnd(
  period: Pick<SchedulePeriod, 'from' | 'until' | 'weeks'>,
): number | null {
  if (!period.until) return null;
  const days = ymdToDayNumber(period.until) - ymdToDayNumber(period.from) + 1;
  const cycleDays = period.weeks.length * 7;
  if (days <= 0 || days % cycleDays !== 0) return null;
  return days / cycleDays;
}

export type ScheduleTrim =
  | { id: string; kind: 'removed' }
  | { id: string; kind: 'shortened'; until: string }
  | { id: string; kind: 'starts_later'; from: string }
  | { id: string; kind: 'split'; until: string; resumesFrom: string; newId: string };

/**
 * Add a period, trimming or splitting whatever it overlaps so no two periods
 * cover the same date. The new period wins in full. Boundaries stay aligned
 * because a period starts on a Monday and ends on a Sunday; a split keeps the
 * right-hand part's `cycle_start`, so a rota keeps its rhythm across the gap.
 * `newId` mints ids for split-off parts.
 */
export function insertSchedulePeriod(
  schedule: CalendarSchedule | null,
  incoming: SchedulePeriod,
  newId: () => string,
): { schedule: CalendarSchedule; trims: ScheduleTrim[] } {
  const start = ymdToDayNumber(incoming.from);
  const end = incoming.until == null ? Number.POSITIVE_INFINITY : ymdToDayNumber(incoming.until);
  const trims: ScheduleTrim[] = [];
  const kept: SchedulePeriod[] = [];
  for (const p of (schedule?.periods ?? []).filter((x) => x.id !== incoming.id)) {
    const pStart = ymdToDayNumber(p.from);
    const pEnd = p.until == null ? Number.POSITIVE_INFINITY : ymdToDayNumber(p.until);
    const overlaps = pStart <= end && pEnd >= start;
    if (!overlaps) {
      kept.push(p);
      continue;
    }
    const startsBefore = pStart < start;
    const endsAfter = pEnd > end;
    if (!startsBefore && !endsAfter) {
      trims.push({ id: p.id, kind: 'removed' });
      continue;
    }
    if (startsBefore && endsAfter) {
      const until = addDaysYmd(incoming.from, -1);
      const resumesFrom = addDaysYmd(incoming.until as string, 1);
      const rightId = newId();
      kept.push({ ...p, until });
      kept.push({ ...p, id: rightId, from: resumesFrom });
      trims.push({ id: p.id, kind: 'split', until, resumesFrom, newId: rightId });
      continue;
    }
    if (startsBefore) {
      const until = addDaysYmd(incoming.from, -1);
      kept.push({ ...p, until });
      trims.push({ id: p.id, kind: 'shortened', until });
      continue;
    }
    const from = addDaysYmd(incoming.until as string, 1);
    kept.push({ ...p, from });
    trims.push({ id: p.id, kind: 'starts_later', from });
  }
  kept.push(incoming);
  kept.sort((a, b) => ymdToDayNumber(a.from) - ymdToDayNumber(b.from));
  return { schedule: { version: 1, periods: kept }, trims };
}

/** The timeline without a period; null once none remain (the server stores null, not an empty list). */
export function removeSchedulePeriod(
  schedule: CalendarSchedule | null,
  id: string,
): CalendarSchedule | null {
  const periods = (schedule?.periods ?? []).filter((p) => p.id !== id);
  return periods.length === 0 ? null : { version: 1, periods };
}

/**
 * Drop the oldest ended periods until the timeline is within `max`.
 *
 * Ended periods are kept on purpose: the planning calendar pages back through
 * them, so a venue can see what its hours were. They only cost anything once
 * the timeline is full, which a calendar that changes its hours every few
 * weeks reaches within a couple of years. Rather than refuse the new change,
 * the change that finished longest ago makes room; nothing current or
 * upcoming is ever dropped, so if the timeline is full of those the caller
 * still gets the validator's error.
 */
export function pruneEndedSchedulePeriods(
  schedule: CalendarSchedule,
  todayYmd: string,
  max: number = SCHEDULE_MAX_PERIODS,
): { schedule: CalendarSchedule; removed: SchedulePeriod[] } {
  if (schedule.periods.length <= max) return { schedule, removed: [] };
  const ended = schedule.periods
    .filter((p) => schedulePeriodHasEnded(p, todayYmd))
    .sort((a, b) => ymdToDayNumber(a.until as string) - ymdToDayNumber(b.until as string));
  const dropped = new Set<string>();
  for (const p of ended) {
    if (schedule.periods.length - dropped.size <= max) break;
    dropped.add(p.id);
  }
  if (dropped.size === 0) return { schedule, removed: [] };
  return {
    schedule: { version: 1, periods: schedule.periods.filter((p) => !dropped.has(p.id)) },
    removed: schedule.periods.filter((p) => dropped.has(p.id)),
  };
}

/** What saving a change does to the changes it overlaps, worded as the web's form previews it. */
export function describeScheduleTrim(trim: ScheduleTrim, byId: Map<string, SchedulePeriod>): string {
  const existing = byId.get(trim.id);
  const label = existing ? `the change from ${describeYmdShort(existing.from)}` : 'an existing change';
  switch (trim.kind) {
    case 'removed':
      return `Replaces ${label} entirely.`;
    case 'shortened':
      return `Shortens ${label} to end on ${describeYmdShort(trim.until)}.`;
    case 'starts_later':
      return `Moves the start of ${label} to ${describeYmdShort(trim.from)}.`;
    case 'split':
      return `Splits ${label}: it pauses on ${describeYmdShort(trim.until)} and resumes on ${describeYmdShort(trim.resumesFrom)}, keeping its rhythm.`;
  }
}
