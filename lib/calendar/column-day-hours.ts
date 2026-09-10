/**
 * What one calendar COLUMN works on one date, and the venue window that column
 * should be shaded against.
 *
 * The grid feed (`GET /api/venue/calendar-grid`) reports each calendar's
 * WEEKLY hours for the date, nothing more (web `getCalendarGrid`: `wh[dow]`).
 * Amended hours (`availability_exceptions`, the Closures & amended hours tab),
 * `days_off` and schedule periods never reach it, so a column amended to
 * 06:00–22:00 drew as 09:00–17:00: the extra hours were off the grid or under
 * the venue-closed shading, and a drop into them read as outside hours. The
 * resolver the diary already had for its closed bands (`calendarHours`, a port
 * of the web's) is the one that knows; this module hands its answer to the
 * grids as the column's working hours, so the day's bounds, the closed
 * shading and the drag's green window all follow the amended hours.
 *
 * ## The venue window, per column
 *
 * The venue's own hours gate GUESTS; staff may book a calendar's amended hours
 * outside them (`allow_outside_hours`, web `calendar-amended-hours-plan.md`:
 * "Opening a calendar on a Sunday the venue is closed lets staff book"). So on
 * an amended day the column's venue window is the venue's hours WIDENED to the
 * calendar's amended hours: the column draws open where the owner said it is,
 * and every other column keeps the venue's shading over those minutes, which is
 * exactly what the owner asked to see (2026-09-10). A weekly template that
 * runs past the venue's hours is not widened: only a deliberate per-date
 * override lifts the venue's shading.
 *
 * ## No band for amended hours
 *
 * The web retired its sky-blue "Amended hours" band (`schedule-closure-blocks.ts`):
 * once the grid follows the resolved hours, the open part of an amended day
 * looks like any other working day and the band told the owner nothing the
 * grid did not already show. The app stops drawing both its calendar and venue
 * amended bands for the same reason.
 */

import { minutesToTime } from '@/components/calendar/grid-layout';
import {
  calendarHasAmendedHours,
  calendarHasWeeklyTemplate,
  calendarHours,
  unionRanges,
  type CalendarScheduleRow,
  type MinuteRange,
} from '@/lib/calendar/calendar-hours';
import type { VenueDayHours } from '@/lib/calendar/venue-closures';

export interface ColumnDayHours {
  /** The minutes the calendar works on this date, resolved (override › days off › schedule › weekly). */
  working: MinuteRange[];
  /**
   * The working hours the grids should take for this column, as the feed
   * shapes them, or null to keep the feed's own when the calendar has no
   * template and no override (an unconfigured column is unconstrained).
   */
  workingHours: { start: string; end: string }[] | null;
  /** The venue window this column is shaded against: the venue's, widened to an amended day's hours. */
  venueHours: VenueDayHours;
  /** The venue window as open ranges, for the closed-band builder (empty = no venue constraint). */
  venueOpenRanges: MinuteRange[];
  /** This date's hours come from a per-date override. */
  amended: boolean;
}

export function resolveColumnDayHours(
  calendar: CalendarScheduleRow | null | undefined,
  dateStr: string,
  venueHours: VenueDayHours,
): ColumnDayHours {
  const working = calendar ? calendarHours(calendar, dateStr) : [];
  const amended = calendar ? calendarHasAmendedHours(calendar, dateStr) : false;
  const hasTemplate = calendar ? calendarHasWeeklyTemplate(calendar) : false;

  let columnVenueHours: VenueDayHours = venueHours;
  if (amended && working.length > 0) {
    if (venueHours.kind === 'open') {
      columnVenueHours = { kind: 'open', periods: unionRanges([...venueHours.periods, ...working]) };
    } else if (venueHours.kind === 'closed') {
      columnVenueHours = { kind: 'open', periods: unionRanges([...working]) };
    }
  }

  return {
    working,
    workingHours:
      working.length > 0 || hasTemplate || amended
        ? working.map((r) => ({ start: minutesToTime(r.start), end: minutesToTime(r.end) }))
        : null,
    venueHours: columnVenueHours,
    venueOpenRanges: columnVenueHours.kind === 'open' ? columnVenueHours.periods : [],
    amended,
  };
}
