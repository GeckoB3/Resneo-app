/**
 * Shapes the diary screen hands to its data hooks (`lib/calendar/diary/use*`), named once so each
 * hook's input reads the same as the screen's own values.
 */
import type { CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';
import type { useAvailabilityBlocks } from '@/lib/queries/useAvailabilityBlocks';
import type { usePractitionerLeave } from '@/lib/queries/useAvailabilityManage';
import type { useCalendarGrid } from '@/lib/queries/useCalendarGrid';
import type { CalendarGridDay } from '@/types/calendar-grid';
import type { OpeningHours } from '@/types/venue';

/** The diary's calendar-grid query (`useCalendarGrid`). */
export type DiaryGridQuery = ReturnType<typeof useCalendarGrid>;

/** Leave across the range on screen (`usePractitionerLeave(...).data.periods`). */
export type DiaryLeavePeriods = NonNullable<ReturnType<typeof usePractitionerLeave>['data']>['periods'];

/** The venue-wide availability blocks (`useAvailabilityBlocks().data`). */
export type DiaryVenueWideBlocks = ReturnType<typeof useAvailabilityBlocks>['data'];

/** The venue's weekly opening hours, or null. */
export type DiaryOpeningHours = OpeningHours | null;

/** A calendar's blocked time on one date: one-off blocks from the grid plus its breaks and closures. */
export type DiaryGetDayBlocks = (
  calId: string,
  dateStr: string,
  gridDay: CalendarGridDay | null,
) => CalendarTimeBlock[];
