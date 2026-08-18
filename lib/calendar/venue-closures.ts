/**
 * Venue-wide closure ranges for the calendar grid.
 *
 * The venue's weekly opening hours (`venue.opening_hours`, from the venue
 * bootstrap) describe when the venue is OPEN. The calendar shades the inverse —
 * the closed gaps within the visible grid window — so a closed day or
 * out-of-hours period reads as "Closed" instead of looking like bookable space.
 *
 * Ports the web's `closedRangesFromOpenWindows` (lib/calendar/schedule-closure-blocks)
 * and, since the calendar started fetching `/api/venue/availability-blocks`, the
 * date-override half of `resolveVenueWideAllowedMinuteRanges` too: one-off
 * closures and amended hours change which minutes are shaded, and the diary was
 * the last surface still answering from the weekly template alone.
 */
import { timeToMinutes } from '@/components/calendar/grid-layout';
import type { OpeningHours } from '@/types/venue';

export type MinuteRange = { start: number; end: number };

/** The venue's open state for one date, resolved from weekly opening hours. */
export type VenueDayHours =
  | { kind: 'unknown' } // no opening-hours data → don't shade
  | { kind: 'closed' } // venue closed all day
  | { kind: 'open'; periods: MinuteRange[] };

/**
 * A venue-wide row from `GET /api/venue/availability-blocks`.
 *
 * Structural on purpose: the hook's `AvailabilityBlock` carries more than this
 * resolver reads, and a resource/service-scoped block (`service_id` set) is not
 * venue-wide and is filtered out below.
 */
export interface VenueWideBlock {
  id: string;
  service_id?: string | null;
  block_type?: string | null;
  date_start: string;
  date_end: string;
  time_start?: string | null;
  time_end?: string | null;
  override_periods?: { open: string; close: string }[] | null;
  created_at?: string | null;
}

/** The venue's resolved day: what to shade, and which window was amended. */
export interface VenueDayResolution {
  hours: VenueDayHours;
  /**
   * The open window an Hours override put on this date, clipped to what the day
   * actually allows. Empty unless an amended-hours block applies — the diary
   * draws it so an amended day reads as deliberate rather than as the template.
   */
  amendedRanges: MinuteRange[];
}

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
 * The WEEKLY baseline for a calendar date ("YYYY-MM-DD"). Keys are "0" (Sun) …
 * "6" (Sat), matching `getDay()`.
 *
 * Exported for the resolver and its tests. Callers that draw the diary want
 * {@link venueDayHours}, which layers the date overrides on top of this.
 */
export function venueWeekDayHours(
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

/** Blocks that apply to this date and speak for the whole venue. */
function venueWideBlocksForDate(blocks: VenueWideBlock[], date: string): VenueWideBlock[] {
  return blocks.filter(
    (b) =>
      b.service_id == null &&
      date >= b.date_start &&
      date <= b.date_end &&
      (b.block_type === 'closed' ||
        b.block_type === 'special_event' ||
        b.block_type === 'amended_hours'),
  );
}

/** Inclusive day span, for the specificity rule below. */
function blockSpanDays(b: VenueWideBlock): number {
  const a = Date.parse(`${b.date_start}T00:00:00Z`);
  const c = Date.parse(`${b.date_end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(c)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round((c - a) / 86_400_000));
}

function amendedPeriodsOf(b: VenueWideBlock): MinuteRange[] {
  if (!Array.isArray(b.override_periods)) return [];
  return b.override_periods
    .map((p) => ({ start: timeToMinutes(p.open), end: timeToMinutes(p.close) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
}

/**
 * Which Hours override wins when several cover the same date (web decision E).
 *
 * Most specific wins — the smallest inclusive date span — so a one-day
 * 10:00–14:00 override nested inside a three-month 08:00–20:00 one NARROWS that
 * day instead of widening to the union of both. Ties break on the later
 * `created_at`; genuinely tied overrides union, which is also what happens when
 * the column was not selected.
 */
function winningAmendedPeriods(dayBlocks: VenueWideBlock[]): MinuteRange[] {
  const applicable = dayBlocks
    .filter((b) => b.block_type === 'amended_hours')
    .map((b) => ({ block: b, periods: amendedPeriodsOf(b) }))
    .filter((x) => x.periods.length > 0);
  if (applicable.length === 0) return [];

  const minSpan = Math.min(...applicable.map((x) => blockSpanDays(x.block)));
  let tied = applicable.filter((x) => blockSpanDays(x.block) === minSpan);
  if (tied.length > 1) {
    const latest = tied.reduce((acc, x) => {
      const at = x.block.created_at ?? '';
      return at > acc ? at : acc;
    }, '');
    const stillTied = tied.filter((x) => (x.block.created_at ?? '') === latest);
    if (stillTied.length > 0) tied = stillTied;
  }
  return mergeAdjacentRanges(tied.flatMap((x) => x.periods));
}

/** Closure windows for the date. A closure with no times covers the whole day. */
function closureWindowsForDate(dayBlocks: VenueWideBlock[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const b of dayBlocks) {
    if (b.block_type !== 'closed' && b.block_type !== 'special_event') continue;
    const ts = b.time_start?.slice(0, 5);
    const te = b.time_end?.slice(0, 5);
    if (!ts || !te) {
      out.push({ start: 0, end: 24 * 60 });
      continue;
    }
    const start = timeToMinutes(ts);
    const end = timeToMinutes(te);
    if (end > start) out.push({ start, end });
  }
  return mergeAdjacentRanges(out);
}

/** Remove `cuts` from `ranges`. A cut through the middle splits a range in two. */
function subtractRanges(ranges: MinuteRange[], cuts: MinuteRange[]): MinuteRange[] {
  let out = ranges.filter((r) => r.end > r.start);
  for (const cut of cuts) {
    if (cut.end <= cut.start) continue;
    const next: MinuteRange[] = [];
    for (const r of out) {
      if (cut.end <= r.start || cut.start >= r.end) {
        next.push(r);
        continue;
      }
      if (cut.start > r.start) next.push({ start: r.start, end: Math.min(cut.start, r.end) });
      if (cut.end < r.end) next.push({ start: Math.max(cut.end, r.start), end: r.end });
    }
    out = next;
  }
  return out;
}

function intersectRanges(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const ra of a) {
    for (const rb of b) {
      const start = Math.max(ra.start, rb.start);
      const end = Math.min(ra.end, rb.end);
      if (start < end) out.push({ start, end });
    }
  }
  return mergeAdjacentRanges(out);
}

const FULL_DAY: MinuteRange[] = [{ start: 0, end: 24 * 60 }];

/**
 * The venue's day, resolved from the weekly template plus its date overrides.
 *
 * Mirrors web's `resolveVenueWideAllowedMinuteRanges` in order and in
 * precedence, because the diary and the booking engine must agree about which
 * minutes exist:
 *
 * 1. the weekly baseline (unconfigured / closed this weekday / open periods);
 * 2. an Hours override REPLACES that baseline, including replacing a
 *    weekly-closed weekday — that is what lets a venue open specially on a day
 *    it does not normally trade;
 * 3. closures subtract LAST, so a closure always beats an Hours override.
 *
 * A part-day closure narrows the day rather than shutting it, which is what web
 * Stage 3 established when it deleted the adapter that turned every closure
 * into a full-day one for appointments.
 */
export function resolveVenueDay(
  openingHours: OpeningHours | null | undefined,
  date: string,
  blocks?: VenueWideBlock[] | null,
): VenueDayResolution {
  const weekly = venueWeekDayHours(openingHours, date);
  const dayBlocks = Array.isArray(blocks) ? venueWideBlocksForDate(blocks, date) : [];
  if (dayBlocks.length === 0) return { hours: weekly, amendedRanges: [] };

  const closures = closureWindowsForDate(dayBlocks);
  const amended = winningAmendedPeriods(dayBlocks);

  // An Hours override replaces the baseline outright, whatever the baseline said.
  let open: MinuteRange[] | null;
  if (amended.length > 0) {
    open = amended;
  } else if (weekly.kind === 'open') {
    open = weekly.periods;
  } else if (weekly.kind === 'closed') {
    // Shut this weekday and nothing claims otherwise; a closure on top changes
    // nothing a viewer can see.
    return { hours: { kind: 'closed' }, amendedRanges: [] };
  } else {
    // No weekly hours configured. Materialise the whole day before subtracting,
    // or a part-day closure would be a silent no-op — the commonest shape for
    // an appointments venue, which often has no opening_hours at all.
    open = closures.length > 0 ? FULL_DAY : null;
  }

  if (open == null) return { hours: { kind: 'unknown' }, amendedRanges: [] };

  const effective = subtractRanges(open, closures);
  if (effective.length === 0) return { hours: { kind: 'closed' }, amendedRanges: [] };

  return {
    hours: { kind: 'open', periods: mergeAdjacentRanges(effective) },
    // No amended band on a day that resolves closed (handled above): telling an
    // owner "closed" and "amended hours" about the same minutes contradicts
    // itself. Clipped to what survives the closures for the same reason.
    amendedRanges: amended.length > 0 ? intersectRanges(amended, effective) : [],
  };
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

/**
 * The venue's open state for a date, weekly hours plus any date overrides.
 *
 * `blocks` is the venue-wide feed from `GET /api/venue/availability-blocks`.
 * Omitting it answers from the weekly template alone, which is what every
 * caller did before the diary started fetching that feed.
 */
export function venueDayHours(
  openingHours: OpeningHours | null | undefined,
  date: string,
  blocks?: VenueWideBlock[] | null,
): VenueDayHours {
  return resolveVenueDay(openingHours, date, blocks).hours;
}
