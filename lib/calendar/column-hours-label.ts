/**
 * The line under a calendar's name in the diary's column header: the hours
 * that column works on the day being shown ("09:00–17:00", "09:00–12:00,
 * 13:00–17:00"), or that it is not working. The owner asked for it beside the
 * web's hours stripes (2026-09-11): the stripes say which minutes are shut and
 * why, the header says at a glance what the column's day is.
 */

export interface HoursRangeLike {
  /** HH:mm[:ss] */
  start: string;
  end: string;
}

const NOT_WORKING = 'Not working';

export function workingHoursLabel(hours: readonly HoursRangeLike[] | null | undefined): string {
  const parts = (hours ?? [])
    .map((r) => ({ start: r.start.slice(0, 5), end: r.end.slice(0, 5) }))
    .filter((r) => r.start && r.end && r.end > r.start)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((r) => `${r.start}–${r.end}`);
  return parts.length > 0 ? parts.join(', ') : NOT_WORKING;
}
