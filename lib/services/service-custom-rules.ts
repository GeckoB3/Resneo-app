/**
 * Pure constructors + mutators for the non-weekly custom-availability rule kinds
 * (`specific_dates`, `date_range_pattern`). The mobile editor now authors these
 * in addition to `weekly`; the round-trip plumbing in
 * `ServiceCustomAvailabilityEditor.toScheduleV2` already preserves them.
 *
 * Kept as a standalone module so the serialisation into `ServiceCustomScheduleV2`
 * is unit-testable without rendering the editor. Mirrors the web
 * `ServiceCustomAvailabilityEditor` rule factories (specific_dates entries =
 * `{ date: YYYY-MM-DD, ranges }`; date_range_pattern = start/end + days_of_week +
 * ranges).
 *
 * @see C:\Resneo\src\components\scheduling\ServiceCustomAvailabilityEditor.tsx
 */
import { timeToMinutes } from '@/components/calendar/grid-layout';
import type {
  ServiceCustomRule,
  ServiceCustomScheduleV2,
  ServiceTimeRange,
} from '@/types/services-manage';

export type SpecificDatesRule = Extract<ServiceCustomRule, { kind: 'specific_dates' }>;
export type DateRangePatternRule = Extract<ServiceCustomRule, { kind: 'date_range_pattern' }>;

/** A new collision-resistant rule id (crypto.randomUUID when available). */
export function newRuleId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Local YYYY-MM-DD for `date` (defaults to today). */
export function toYmd(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Default 09:00–17:00 window (matches the web seed). */
export function defaultRange(): ServiceTimeRange {
  return { start: '09:00', end: '17:00' };
}

/** Fresh empty `specific_dates` rule. */
export function makeSpecificDatesRule(): SpecificDatesRule {
  return { id: newRuleId(), kind: 'specific_dates', entries: [] };
}

/** Fresh `date_range_pattern` rule seeded to a single day, Mon–Fri, 9–5. */
export function makeDateRangePatternRule(startYmd: string = toYmd()): DateRangePatternRule {
  return {
    id: newRuleId(),
    kind: 'date_range_pattern',
    start_date: startYmd,
    end_date: startYmd,
    days_of_week: [1, 2, 3, 4, 5],
    ranges: [defaultRange()],
  };
}

/** Toggle one date in a specific-dates rule (add with a default window / remove). */
export function toggleSpecificDate(rule: SpecificDatesRule, ymd: string): SpecificDatesRule {
  const exists = rule.entries.some((e) => e.date === ymd);
  const entries = exists
    ? rule.entries.filter((e) => e.date !== ymd)
    : [...rule.entries, { date: ymd, ranges: [defaultRange()] }].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
  return { ...rule, entries };
}

/** Replace the time ranges for one date entry. */
export function setSpecificDateRanges(
  rule: SpecificDatesRule,
  ymd: string,
  ranges: ServiceTimeRange[],
): SpecificDatesRule {
  return {
    ...rule,
    entries: rule.entries.map((e) => (e.date === ymd ? { ...e, ranges } : e)),
  };
}

/** Set the start/end of a date-range pattern, keeping end ≥ start (sorted). */
export function setDateRange(
  rule: DateRangePatternRule,
  startYmd: string,
  endYmd: string,
): DateRangePatternRule {
  const [a, b] = startYmd <= endYmd ? [startYmd, endYmd] : [endYmd, startYmd];
  return { ...rule, start_date: a, end_date: b };
}

/** Toggle a weekday (0=Sun … 6=Sat) on a date-range pattern. */
export function toggleDayOfWeek(rule: DateRangePatternRule, dow: number): DateRangePatternRule {
  const next = rule.days_of_week.includes(dow)
    ? rule.days_of_week.filter((d) => d !== dow)
    : [...rule.days_of_week, dow].sort((a, b) => a - b);
  return { ...rule, days_of_week: next };
}

/** Replace the daily windows applied across a date-range pattern. */
export function setDateRangeRanges(
  rule: DateRangePatternRule,
  ranges: ServiceTimeRange[],
): DateRangePatternRule {
  return { ...rule, ranges };
}

// --- Schedule-level serialisation ------------------------------------------

/**
 * Upsert a rule into the schedule by id (append when new), returning a fresh
 * `ServiceCustomScheduleV2`. This is the serialiser the editor uses when an
 * advanced rule changes — it never disturbs the other rules (e.g. the weekly
 * rule the mobile editor also writes).
 */
export function upsertRule(
  schedule: ServiceCustomScheduleV2,
  rule: ServiceCustomRule,
): ServiceCustomScheduleV2 {
  const exists = schedule.rules.some((r) => r.id === rule.id);
  const rules = exists
    ? schedule.rules.map((r) => (r.id === rule.id ? rule : r))
    : [...schedule.rules, rule];
  return { version: 2, rules };
}

/** Remove a rule by id. */
export function removeRule(
  schedule: ServiceCustomScheduleV2,
  ruleId: string,
): ServiceCustomScheduleV2 {
  return { version: 2, rules: schedule.rules.filter((r) => r.id !== ruleId) };
}

/**
 * Validate the advanced rule kinds the editor can now author. Returns the first
 * error string or null. (Weekly windows are validated separately by
 * `validateSchedule` in the editor module.)
 *  - specific_dates: every range must end after it starts.
 *  - date_range_pattern: end ≥ start, ≥1 weekday, every range end > start.
 */
export function validateAdvancedRules(schedule: ServiceCustomScheduleV2): string | null {
  for (const rule of schedule.rules) {
    if (rule.kind === 'specific_dates') {
      for (const entry of rule.entries) {
        for (const range of entry.ranges) {
          if (timeToMinutes(range.end) <= timeToMinutes(range.start)) {
            return 'Each specific-date window must end after it starts.';
          }
        }
      }
    } else if (rule.kind === 'date_range_pattern') {
      if (rule.end_date < rule.start_date) {
        return 'A date range must end on or after it starts.';
      }
      if (rule.days_of_week.length === 0) {
        return 'Pick at least one weekday for the date-range schedule.';
      }
      for (const range of rule.ranges) {
        if (timeToMinutes(range.end) <= timeToMinutes(range.start)) {
          return 'Each date-range window must end after it starts.';
        }
      }
    }
  }
  return null;
}
