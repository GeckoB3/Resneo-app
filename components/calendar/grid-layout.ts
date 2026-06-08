/**
 * Layout math for the day calendar grid. Mirrors the web's minute→pixel model
 * (web uses 48px / 15min); we use a slightly taller scale for touch.
 */

/** Vertical scale — pixels per minute. 2 → 120px per hour. */
export const PX_PER_MINUTE = 2;
/** Grid line interval in minutes (hour lines are emphasised). */
export const SLOT_MINUTES = 30;
/** Width of the left time-label gutter. */
export const TIME_GUTTER_WIDTH = 56;
/** Minimum visual height for a block, so short appointments stay tappable. */
export const MIN_BLOCK_MINUTES = 28;
/** Default opening when a day has no working hours. */
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 20;
/** Snap empty-slot taps to this granularity (minutes). */
export const TAP_SNAP_MINUTES = 15;

/** "14:30" or "14:30:00" → minutes since midnight (870). */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m ?? 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

/** Minutes since midnight → "HH:mm". */
export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export type GridBounds = { startHour: number; endHour: number };

/**
 * Pick grid start/end hours that contain every supplied minute-range (working
 * hours + bookings), so nothing is clipped. Falls back to the default window.
 */
export function computeGridBounds(ranges: { start: number; end: number }[]): GridBounds {
  if (ranges.length === 0) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const range of ranges) {
    minStart = Math.min(minStart, range.start);
    maxEnd = Math.max(maxEnd, range.end);
  }
  const startHour = Math.max(0, Math.floor(minStart / 60));
  const endHour = Math.min(24, Math.ceil(maxEnd / 60));
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}
