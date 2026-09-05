import { calendarHours, type CalendarScheduleRow, type MinuteRange } from '@/lib/calendar/calendar-hours';
import { leaveForCalendarOnDate, type LeavePeriodInput } from '@/lib/calendar/schedule-closures';
import { resolveVenueDay, type VenueWideBlock } from '@/lib/calendar/venue-closures';

/**
 * The calendar's "Only calendars working on the selected day" filter (web
 * 2026-09-05, `calendar-works-on-date.ts`). It asks whether a column has hours
 * to show, not whether it is busy, so staff "block time" is deliberately not
 * subtracted.
 */

function subtractRanges(open: MinuteRange[], closed: readonly MinuteRange[]): MinuteRange[] {
  let out = open.filter((r) => r.end > r.start);
  for (const c of closed) {
    const next: MinuteRange[] = [];
    for (const r of out) {
      if (c.end <= r.start || c.start >= r.end) {
        next.push(r);
        continue;
      }
      if (c.start > r.start) next.push({ start: r.start, end: c.start });
      if (c.end < r.end) next.push({ start: c.end, end: r.end });
    }
    out = next;
  }
  return out;
}

function intersectRanges(a: readonly MinuteRange[], b: readonly MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const ra of a) {
    for (const rb of b) {
      const start = Math.max(ra.start, rb.start);
      const end = Math.min(ra.end, rb.end);
      if (start < end) out.push({ start, end });
    }
  }
  return out;
}

/**
 * Whether the calendar's own schedule (weekly template, the rota period covering
 * the date, a per-date override, days off) gives it any hours on `dateYmd`. The
 * template-only answer, for a LINKED column, whose owner venue shares its
 * weekly hours but not its leave or closures. Own columns use
 * {@link calendarHasAvailableHoursOnDate}.
 */
export function calendarWorksOnDate(row: CalendarScheduleRow, dateYmd: string): boolean {
  return calendarHours(row, dateYmd).some((r) => r.end > r.start);
}

/**
 * Whether one of this venue's own calendars has any bookable minute left on
 * `dateYmd`: its hours for the date (through the same resolver the diary's
 * closure bands use), minus recorded leave, minus the venue's own closures and
 * opening hours. A full day of leave, a venue closure, or a partial leave that
 * swallows every working minute all answer false. A venue with no opening
 * hours configured constrains nothing, as everywhere else in the diary.
 */
export function calendarHasAvailableHoursOnDate(params: {
  calendarId: string;
  row: CalendarScheduleRow;
  dateYmd: string;
  leavePeriods: readonly LeavePeriodInput[];
  openingHours: Parameters<typeof resolveVenueDay>[0];
  venueWideBlocks: VenueWideBlock[] | null | undefined;
}): boolean {
  const { calendarId, row, dateYmd, leavePeriods, openingHours, venueWideBlocks } = params;
  let open = calendarHours(row, dateYmd);
  if (open.length === 0) return false;

  const leave = leaveForCalendarOnDate(calendarId, dateYmd, leavePeriods);
  if (leave.fullDay) return false;
  open = subtractRanges(open, leave.partial);

  const venue = resolveVenueDay(openingHours, dateYmd, venueWideBlocks).hours;
  if (venue.kind === 'closed') return false;
  if (venue.kind === 'open') open = intersectRanges(open, venue.periods);

  return open.some((r) => r.end > r.start);
}
