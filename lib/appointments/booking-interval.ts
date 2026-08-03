/**
 * Per-service booking interval + per-hour start marks, or fixed times of day.
 * Mirrors `_reference/Resneo/src/lib/appointments/booking-interval.ts` so the app
 * agrees with the availability engine and the save API on what a service offers.
 *
 * A service picks one of two ways to offer candidate start times:
 *
 * 1. Interval (default). Candidates sit on a grid anchored to the top of each
 *    hour, spaced by `booking_interval_minutes` (1-60). Optionally,
 *    `booking_minute_marks` restricts which of those grid offsets are actually
 *    bookable, so a venue can take bookings every 5 minutes for the first half of
 *    each hour, or only on the hour and quarter past.
 * 2. Fixed times. When `booking_start_times` is set, those absolute times of day
 *    are the only candidates and the interval grid is ignored, e.g.
 *    ["09:20","11:30","13:45"] for a business that takes a handful of jobs a day
 *    at times that do not repeat hourly.
 *
 * The app never generates slots itself (availability comes from the server), so
 * this module exists for the service editor: it has to read, present and save the
 * same configuration the engine reads.
 */

export const DEFAULT_BOOKING_INTERVAL_MINUTES = 15;
export const MIN_BOOKING_INTERVAL_MINUTES = 1;
export const MAX_BOOKING_INTERVAL_MINUTES = 60;

/** Interval presets surfaced as quick-pick chips (any 1-60 value is still valid). */
export const BOOKING_INTERVAL_PRESETS = [5, 10, 15, 20, 30, 60];

/** Clamp/floor an interval to 1-60; falls back to the default when invalid. */
export function normalizeBookingIntervalMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_BOOKING_INTERVAL_MINUTES;
  const floored = Math.floor(n);
  if (floored < MIN_BOOKING_INTERVAL_MINUTES) return MIN_BOOKING_INTERVAL_MINUTES;
  if (floored > MAX_BOOKING_INTERVAL_MINUTES) return MAX_BOOKING_INTERVAL_MINUTES;
  return floored;
}

/** Every start-minute offset within an hour for the given interval, anchored at :00. */
export function bookingIntervalGrid(intervalMinutes: number): number[] {
  const interval = normalizeBookingIntervalMinutes(intervalMinutes);
  const grid: number[] = [];
  for (let m = 0; m < 60; m += interval) grid.push(m);
  return grid;
}

/** Sanitize raw marks to unique, in-range, on-grid, ascending offsets. */
export function sanitizeBookingMinuteMarks(raw: unknown, intervalMinutes: number): number[] {
  if (!Array.isArray(raw)) return [];
  const grid = new Set(bookingIntervalGrid(intervalMinutes));
  return [
    ...new Set(
      raw
        .map((m) => (typeof m === 'number' ? m : Number(m)))
        .filter((m) => Number.isInteger(m) && grid.has(m)),
    ),
  ].sort((a, b) => a - b);
}

/** `HH:MM` on a 24-hour clock. */
const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Sanitize raw fixed start times (from the API or the editor) to unique, valid `HH:MM`, ascending. */
export function sanitizeBookingStartTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const time = item.slice(0, 5);
    if (!START_TIME_PATTERN.test(time)) continue;
    seen.add(time);
  }
  // Zero-padded HH:MM sorts lexicographically in chronological order.
  return [...seen].sort();
}

/** Minutes since midnight for each `HH:MM`. Assumes already sanitized. */
export function bookingStartTimesToMinutes(times: string[]): number[] {
  return times.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
}

/** Minutes since midnight → `HH:MM`, the storage form the API validates. */
export function minutesToBookingStartTime(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** True when this service offers fixed times of day rather than an interval grid. */
export function usesFixedStartTimes(startTimes: unknown): boolean {
  return sanitizeBookingStartTimes(startTimes).length > 0;
}

/**
 * Storage normalization for the API. A full-grid or empty mark set collapses to
 * NULL ("no restriction") so the engine treats it as a plain interval, and an
 * empty fixed-time list collapses to NULL so the service falls back to the grid.
 */
export function normalizeBookingStartForStorage(
  intervalMinutes: unknown,
  minuteMarks: unknown,
  startTimes?: unknown,
): {
  booking_interval_minutes: number;
  booking_minute_marks: number[] | null;
  booking_start_times: string[] | null;
} {
  const interval = normalizeBookingIntervalMinutes(
    intervalMinutes ?? DEFAULT_BOOKING_INTERVAL_MINUTES,
  );
  const times = sanitizeBookingStartTimes(startTimes ?? null);
  const booking_start_times = times.length > 0 ? times : null;
  if (minuteMarks == null) {
    return { booking_interval_minutes: interval, booking_minute_marks: null, booking_start_times };
  }
  const grid = bookingIntervalGrid(interval);
  const marks = sanitizeBookingMinuteMarks(minuteMarks, interval);
  const restricted = marks.length > 0 && marks.length < grid.length;
  return {
    booking_interval_minutes: interval,
    booking_minute_marks: restricted ? marks : null,
    booking_start_times,
  };
}

/** Human-readable summary like ":00, :05, :10". */
export function describeBookingStartOffsets(offsets: number[]): string {
  return offsets.map((m) => `:${String(m).padStart(2, '0')}`).join(', ');
}

/** Human-readable summary like "9:20am, 11:30am, 1:45pm". */
export function describeBookingStartTimes(times: string[]): string {
  return sanitizeBookingStartTimes(times)
    .map((t) => {
      const hour = Number(t.slice(0, 2));
      const minute = t.slice(3, 5);
      const suffix = hour < 12 ? 'am' : 'pm';
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return `${display}:${minute}${suffix}`;
    })
    .join(', ');
}

/**
 * First pair of consecutive fixed times closer together than one appointment
 * takes. Not an error — the server still honours both, and staff may want the
 * choice — but guests will usually only ever be offered one of them, so the
 * editor says so rather than letting it look like a bug later.
 */
export function findTooCloseStartTimes(
  times: string[],
  spanMinutes: number,
): { earlier: string; later: string } | null {
  if (!Number.isFinite(spanMinutes) || spanMinutes <= 0) return null;
  const sorted = sanitizeBookingStartTimes(times);
  const minutes = bookingStartTimesToMinutes(sorted);
  for (let i = 1; i < minutes.length; i++) {
    if (minutes[i]! - minutes[i - 1]! < spanMinutes) {
      return { earlier: sorted[i - 1]!, later: sorted[i]! };
    }
  }
  return null;
}

/**
 * Stable fingerprint of the whole booking-start config, so the service form can
 * send these admin-only fields only when the editor actually changed them (an
 * untouched form must not include them — a staff edit's payload is permission
 * filtered and never carries them).
 */
export function bookingStartFingerprint(
  intervalMinutes: number,
  minuteMarks: number[] | null,
  startTimes: string[] | null,
): string {
  const norm = normalizeBookingStartForStorage(intervalMinutes, minuteMarks, startTimes);
  return [
    norm.booking_interval_minutes,
    norm.booking_minute_marks ? norm.booking_minute_marks.join(',') : 'null',
    norm.booking_start_times ? norm.booking_start_times.join(',') : 'null',
  ].join('|');
}
