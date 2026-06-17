/**
 * Parse a linked practitioner's working-hours template into open minute-ranges
 * for a date. The linked-calendar payload carries `workingHours` as opaque
 * weekday-keyed data (mirroring the web `WorkingHours` shape —
 * `Record<weekday, {start,end}[]>` with numeric '0'..'6' (Sun..Sat) keys and a
 * legacy `sun..sat` fallback). Pure + unit-tested so the linked calendar's
 * available-hours window can't silently regress.
 */
import { timeToMinutes } from '@/components/calendar/grid-layout';
import type { MinuteRange } from '@/lib/calendar/venue-closures';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Open minute-ranges for the given "YYYY-MM-DD" date, or [] when closed/absent. */
export function openRangesForDate(workingHours: unknown, date: string): MinuteRange[] {
  if (!workingHours || typeof workingHours !== 'object') return [];
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return [];
  const weekday = new Date(y, m - 1, d).getDay();
  const wh = workingHours as Record<string, unknown>;
  const raw = wh[String(weekday)] ?? wh[DAY_NAMES[weekday]!];
  if (!Array.isArray(raw)) return [];
  const out: MinuteRange[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    // Tolerate both the working-hours `{start,end}` and opening-hours
    // `{open,close}` spellings defensively.
    const start = typeof e.start === 'string' ? e.start : typeof e.open === 'string' ? e.open : null;
    const end = typeof e.end === 'string' ? e.end : typeof e.close === 'string' ? e.close : null;
    if (!start || !end) continue;
    const s = timeToMinutes(start);
    const en = timeToMinutes(end);
    if (en > s) out.push({ start: s, end: en });
  }
  return out;
}

/** True if a working-hours template publishes any hours on any weekday. */
export function hasAnyWorkingHours(workingHours: unknown): boolean {
  if (!workingHours || typeof workingHours !== 'object') return false;
  return Object.values(workingHours as Record<string, unknown>).some(
    (v) => Array.isArray(v) && v.length > 0,
  );
}
