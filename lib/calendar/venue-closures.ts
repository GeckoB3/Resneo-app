/**
 * Venue-wide closure ranges for the calendar grid.
 *
 * The venue's weekly opening hours (`venue.opening_hours`, from the venue
 * bootstrap) describe when the venue is OPEN. The calendar shades the inverse —
 * the closed gaps within the visible grid window — so a closed day or
 * out-of-hours period reads as "Closed" instead of looking like bookable space.
 *
 * Ports the web's `closedRangesFromOpenWindows` (lib/calendar/schedule-closure-blocks).
 * Pure + unit-tested. One-off / amended-hours date overrides are NOT handled here
 * (they need a venue-wide blocks feed the app doesn't fetch); this is the weekly
 * opening-hours closure, which covers closed days + daily open windows.
 */
import { timeToMinutes } from '@/components/calendar/grid-layout';
import type { OpeningHours } from '@/types/venue';

export type MinuteRange = { start: number; end: number };

/** The venue's open state for one date, resolved from weekly opening hours. */
export type VenueDayHours =
  | { kind: 'unknown' } // no opening-hours data → don't shade
  | { kind: 'closed' } // venue closed all day
  | { kind: 'open'; periods: MinuteRange[] };

type WeekdayKey = '0' | '1' | '2' | '3' | '4' | '5' | '6';

function mergeAdjacentRanges(ranges: MinuteRange[]): MinuteRange[] {
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

/** Complement of `open` within [boundsStart, boundsEnd] — the closed gaps. */
export function closedRangesFromOpenWindows(
  open: MinuteRange[],
  boundsStart: number,
  boundsEnd: number,
): MinuteRange[] {
  if (boundsEnd <= boundsStart) return [];
  const openSorted = mergeAdjacentRanges(open);
  const closed: MinuteRange[] = [];
  let cursor = boundsStart;
  for (const r of openSorted) {
    if (r.start > cursor) {
      closed.push({ start: cursor, end: Math.min(r.start, boundsEnd) });
    }
    cursor = Math.max(cursor, r.end);
    if (cursor >= boundsEnd) break;
  }
  if (cursor < boundsEnd) {
    closed.push({ start: cursor, end: boundsEnd });
  }
  return closed.filter((r) => r.end > r.start);
}

/**
 * Resolve the venue's open state for a calendar date ("YYYY-MM-DD") from the
 * weekly opening hours. Keys are "0" (Sun) … "6" (Sat), matching `getDay()`.
 */
export function venueDayHours(
  openingHours: OpeningHours | null | undefined,
  date: string,
): VenueDayHours {
  if (!openingHours) return { kind: 'unknown' };
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return { kind: 'unknown' };
  const weekday = new Date(y, m - 1, d).getDay();
  const day = openingHours[String(weekday) as WeekdayKey];
  if (!day) return { kind: 'unknown' };
  if (day.closed === true) return { kind: 'closed' };
  const periods = (day.periods ?? [])
    .map((p) => ({ start: timeToMinutes(p.open), end: timeToMinutes(p.close) }))
    .filter((r) => r.end > r.start);
  // "Open" with no usable periods is ambiguous → treat as unknown (don't shade).
  if (periods.length === 0) return { kind: 'unknown' };
  return { kind: 'open', periods };
}

/** Closed minute-ranges to shade within the grid's [startMin, endMin] window. */
export function venueClosedRanges(
  hours: VenueDayHours | undefined,
  gridStartMin: number,
  gridEndMin: number,
): MinuteRange[] {
  if (!hours || hours.kind === 'unknown') return [];
  if (hours.kind === 'closed') {
    return gridEndMin > gridStartMin ? [{ start: gridStartMin, end: gridEndMin }] : [];
  }
  return closedRangesFromOpenWindows(hours.periods, gridStartMin, gridEndMin);
}
