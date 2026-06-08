import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';

import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';

/** Parse YYYY-MM-DD as a local calendar date (noon UTC avoids DST edge cases). */
function parseCalendarDateStr(dateStr: string): Date {
  return parseISO(`${dateStr}T12:00:00.000Z`);
}

/**
 * Add (or subtract) whole days to a calendar date string.
 * @param dateStr - YYYY-MM-DD
 * @param days - positive or negative day offset
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  return format(addDays(parseCalendarDateStr(dateStr), days), 'yyyy-MM-dd');
}

export type WeekDateRange = {
  /** First day of the 7-day window (YYYY-MM-DD). */
  from: string;
  /** Last day of the 7-day window (YYYY-MM-DD). */
  to: string;
  /** All seven calendar dates in order, inclusive. */
  days: string[];
};

/**
 * Returns a 7-day window starting on `startDate` (or today in the venue timezone).
 * Used by the Week tab to fetch and display one rolling week.
 */
export function getWeekRangeFromDate(
  startDate?: string,
  timeZone: string = 'Europe/London',
): WeekDateRange {
  const from = startDate ?? calendarDateInTimeZone(new Date(), timeZone);
  const days = Array.from({ length: 7 }, (_, index) => addDaysToDateStr(from, index));
  return { from, to: days[6]!, days };
}

/**
 * Monday-aligned calendar week containing `dateStr` (for the week strip).
 */
export function getCalendarWeekFromDate(dateStr: string): WeekDateRange {
  const monday = startOfWeek(parseCalendarDateStr(dateStr), { weekStartsOn: 1 });
  const from = format(monday, 'yyyy-MM-dd');
  const days = Array.from({ length: 7 }, (_, index) => addDaysToDateStr(from, index));
  return { from, to: days[6]!, days };
}

/**
 * Compact chip label for the horizontal day picker, e.g. "Mon 23".
 */
export function formatShortDayLabel(dateStr: string): string {
  const date = parseCalendarDateStr(dateStr);
  const weekday = format(date, 'EEE');
  const day = format(date, 'd');
  return `${weekday} ${day}`;
}

/**
 * Full day heading for the selected day's booking list, e.g. "Tuesday 23 May".
 */
export function formatDayHeading(dateStr: string): string {
  const date = parseCalendarDateStr(dateStr);
  return format(date, 'EEEE d MMMM');
}

export type DateRange = {
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** Inclusive range end (YYYY-MM-DD). */
  to: string;
};

/** Shift a calendar date by whole months (e.g. month-scope navigation). */
export function addMonthsToDateStr(dateStr: string, months: number): string {
  return format(addMonths(parseCalendarDateStr(dateStr), months), 'yyyy-MM-dd');
}

/** First and last calendar dates of the month containing `dateStr`. */
export function getMonthRangeFromDate(dateStr: string): DateRange {
  const date = parseCalendarDateStr(dateStr);
  return {
    from: format(startOfMonth(date), 'yyyy-MM-dd'),
    to: format(endOfMonth(date), 'yyyy-MM-dd'),
  };
}

/** Month + year label, e.g. "May 2026". */
export function formatMonthLabel(dateStr: string): string {
  return format(parseCalendarDateStr(dateStr), 'MMMM yyyy');
}

/** Compact range label, e.g. "23 May – 29 May". */
export function formatRangeLabel(from: string, to: string): string {
  return `${format(parseCalendarDateStr(from), 'd MMM')} – ${format(parseCalendarDateStr(to), 'd MMM')}`;
}

export { calendarDateInTimeZone };
