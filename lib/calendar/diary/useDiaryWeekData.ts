import { format } from 'date-fns';
import { useMemo } from 'react';

import { type WeekDayColumn } from '@/components/calendar/WeekGrid';
import { resolveColumnDayHours } from '@/lib/calendar/column-day-hours';
import { diaryColumnLabel } from '@/lib/calendar/diary-columns';
import { localNoon, scheduleKey, type Scope } from '@/lib/calendar/diary-screen';
import type {
  DiaryGetDayBlocks,
  DiaryGridQuery,
  DiaryLeavePeriods,
  DiaryOpeningHours,
  DiaryVenueWideBlocks,
} from '@/lib/calendar/diary/types';
import { buildCalendarClosureOverlays } from '@/lib/calendar/schedule-closures';
import { venueDayHours } from '@/lib/calendar/venue-closures';
import type { LinkedVenueCalendar } from '@/types/linked-venues';
import type { Practitioner } from '@/types/practitioner';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

export interface DiaryWeekDataInput {
  scope: Scope;
  week: { days: string[] };
  today: string;
  effectiveId: string | null;
  practitioners: Practitioner[];
  linkedVenues: LinkedVenueCalendar[];
  gridQuery: DiaryGridQuery;
  getDayBlocks: DiaryGetDayBlocks;
  scheduleByCalendarDate: Map<string, CalendarScheduleBlock[]>;
  openingHours: DiaryOpeningHours;
  venueWideBlocks: DiaryVenueWideBlocks;
  leavePeriods: DiaryLeavePeriods;
}

/**
 * The week view's data: seven day columns for the selected calendar, and the
 * whole-team matrix's rows, linked counts and day headers. Moved out of the
 * diary screen unchanged (codebase standards P5.2).
 */
export function useDiaryWeekData({
  scope,
  week,
  today,
  effectiveId,
  practitioners,
  linkedVenues,
  gridQuery,
  getDayBlocks,
  scheduleByCalendarDate,
  openingHours,
  venueWideBlocks,
  leavePeriods,
}: DiaryWeekDataInput) {
  // ---- Week view data ----
  // Seven day-columns for the SELECTED calendar (one practitioner's week).
  const weekColumns = useMemo<WeekDayColumn[]>(() => {
    if (scope !== 'week') return [];
    const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === effectiveId);
    const byDate = new Map((calendar?.dates ?? []).map((d) => [d.date, d]));
    return week.days.map((date) => {
      const data = byDate.get(date) ?? null;
      const d = localNoon(date);
      const weekday = d.getDay();
      const column = resolveColumnDayHours(
        practitioners.find((p) => p.id === effectiveId),
        date,
        venueDayHours(openingHours, date, venueWideBlocks),
      );
      return {
        date,
        weekdayLabel: format(d, 'EEE'),
        dayNumber: format(d, 'd'),
        isToday: date === today,
        isWeekend: weekday === 0 || weekday === 6,
        workingHours: column.workingHours ?? data?.workingHours ?? [],
        bookings: data?.bookings ?? [],
        sessions: data?.sessions ?? [],
        // The selected calendar's class/event/resource blocks for this day.
        scheduleBlocks: effectiveId
          ? scheduleByCalendarDate.get(scheduleKey(effectiveId, date)) ?? []
          : [],
        // Venue open/closed state for this day → "Closed" shading, widened to
        // the calendar's amended hours on an amended day.
        venueHours: column.venueHours,
        // Time blocked by hand, so a day that looks free in this view really is (web parity).
        manualBlocks: effectiveId ? getDayBlocks(effectiveId, date, data).filter((b) => b.isEditable) : [],
        /**
         * Closure bands only — not breaks, which stay a Day-view detail. "Who is off
         * this week?" is the question the week view exists to answer, and a column
         * that renders the same whether the person is working or on leave cannot
         * answer it.
         */
        timeBlocks: effectiveId
          ? buildCalendarClosureOverlays({
              calendarId: effectiveId,
              dateStr: date,
              calendar: practitioners.find((p) => p.id === effectiveId),
              leavePeriods,
            })
          : [],
      };
    });
  }, [getDayBlocks, scope, gridQuery.data, effectiveId, week.days, today, scheduleByCalendarDate, openingHours, venueWideBlocks, practitioners, leavePeriods]);

  // ---- Whole-team week matrix data (week-scope "All") ----
  // Practitioner rows + 7 day-column headers. The cell counts are derived inside
  // WeekMatrixGrid straight from gridQuery.data, so this only supplies labels.
  const weekMatrixCalendars = useMemo(
    () => [
      // A paused calendar with bookings this week keeps its row: "Marcus (paused)".
      ...practitioners.map((p) => ({ id: p.id, name: diaryColumnLabel(p) })),
      /**
       * Then every linked venue's calendars. The week matrix used to show our
       * rows only, so a partner booking counted nowhere in week scope even though
       * the day view draws that column (device test, 2026-09-12).
       */
      ...linkedVenues.flatMap((v) =>
        v.practitioners.map((p) => ({
          id: `${v.venueId}:${p.id}`,
          name: p.name,
          linked: true,
          venueName: v.venueName,
        })),
      ),
    ],
    [practitioners, linkedVenues],
  );

  /** Linked bookings per `${venueId}:${calendarId}|${date}`, for the matrix cells. */
  const weekMatrixLinkedCounts = useMemo(() => {
    const map = new Map<string, number>();
    if (scope !== 'week') return map;
    for (const v of linkedVenues) {
      for (const b of v.bookings) {
        if (!b.bookingDate || b.status === 'No-Show') continue;
        const calendarId = b.practitionerId ?? b.calendarId;
        if (!calendarId) continue;
        const key = `${v.venueId}:${calendarId}|${b.bookingDate}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [scope, linkedVenues]);
  const weekMatrixDays = useMemo(() => {
    if (scope !== 'week') return [];
    return week.days.map((date) => {
      const d = localNoon(date);
      const weekday = d.getDay();
      return {
        date,
        weekdayLabel: format(d, 'EEE'),
        dayNumber: format(d, 'd'),
        isToday: date === today,
        isWeekend: weekday === 0 || weekday === 6,
      };
    });
  }, [scope, week.days, today]);

  return { weekColumns, weekMatrixCalendars, weekMatrixLinkedCounts, weekMatrixDays };
}
