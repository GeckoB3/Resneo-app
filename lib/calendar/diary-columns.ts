/**
 * Which team calendars the diary draws a column (day), a row (week) or a chip
 * for (web QA C-11, R44-3).
 *
 * The diary drew ACTIVE calendars only, and asked the grid for those alone, so
 * pausing a calendar took its column away and every appointment on it with it:
 * still Booked, drawn nowhere, and no chip to bring the column back. The
 * owner's decision (2026-10-01): a paused calendar keeps its column on any day
 * in view where it still has something live on it, marked Paused, and stays
 * hidden on days where it has nothing. Drawing it does not make it bookable:
 * see {@link diaryColumnTakesNewBookings}.
 *
 * "Live" is anything the diary draws as holding time: Booked, Confirmed,
 * Pending, Started (stored as Seated) and Completed. Completed counts on
 * purpose: an appointment finished this morning on a calendar paused at lunch
 * is still part of the day's record. A class session, an event or a resource
 * booking placed on the calendar keeps its column too.
 *
 * The app's mirror of the web's pure helper; keep the rule in step with it.
 * @see C:\Resneo\src\app\dashboard\practitioner-calendar\diary-columns.ts
 */
import { isResourceCalendar } from '@/lib/calendar/schedule-calendars';

export interface DiaryColumnCalendar {
  id: string;
  is_active: boolean;
  calendar_type?: string | null;
  sort_order?: number | null;
}

/** The slice of `GET /api/venue/calendar-grid` the rule reads. */
export interface DiaryColumnGrid {
  calendars: readonly {
    calendarId: string;
    dates: readonly { date: string; bookings: readonly { status: string }[] }[];
  }[];
}

/** A class session, event or resource booking from the schedule feed, placed on a calendar. */
export interface DiaryColumnScheduleBlock {
  date: string;
  calendar_id?: string | null;
  status?: string | null;
}

/** Web `APPOINTMENT_TIME_HOLDING_STATUSES` (`src/lib/availability/capacity-status.ts`). */
const TIME_HOLDING_STATUSES: readonly string[] = [
  'Booked',
  'Confirmed',
  'Pending',
  'Seated',
  'Completed',
];

/** True when an appointment in this status holds its booked time on the diary. */
export function holdsAppointmentTime(status: string | null | undefined): boolean {
  return status != null && TIME_HOLDING_STATUSES.includes(status);
}

type DiaryColumnParams<T extends DiaryColumnCalendar> = {
  /** The whole roster, paused calendars included. */
  calendars: readonly T[];
  /** The grid for the dates in view, asked for every calendar of the roster. */
  grid: DiaryColumnGrid | null | undefined;
  scheduleBlocks?: readonly DiaryColumnScheduleBlock[];
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
};

/**
 * The calendars to draw for the dates in view: every active team calendar,
 * plus each paused one that has something live on those dates, in column
 * order. Resource calendars are never columns: their bookings are drawn on the
 * calendar they are shown on.
 */
export function diaryColumnCalendars<T extends DiaryColumnCalendar>(
  params: DiaryColumnParams<T>,
): T[] {
  const { calendars, grid, scheduleBlocks = [], from, to } = params;
  const inView = (date: string) => date >= from && date <= to;

  const busyColumnIds = new Set<string>();
  for (const calendar of grid?.calendars ?? []) {
    const busy = calendar.dates.some(
      (day) => inView(day.date) && day.bookings.some((b) => holdsAppointmentTime(b.status)),
    );
    if (busy) busyColumnIds.add(calendar.calendarId);
  }
  for (const block of scheduleBlocks) {
    if (!block.calendar_id || block.status === 'Cancelled' || !inView(block.date)) continue;
    busyColumnIds.add(block.calendar_id);
  }

  return calendars
    .filter((c) => !isResourceCalendar(c) && (c.is_active || busyColumnIds.has(c.id)))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * The drawn calendars as one string of ids, in column order. The diary
 * memoises on this, so a booking arriving or moving rebuilds the columns only
 * when it changes WHICH calendars are drawn, not on every poll of the grid.
 */
export function diaryColumnCalendarIdsKey<T extends DiaryColumnCalendar>(
  params: DiaryColumnParams<T>,
): string {
  return diaryColumnCalendars(params)
    .map((c) => c.id)
    .join(',');
}

/** The calendars named by {@link diaryColumnCalendarIdsKey}, in that order. */
export function diaryCalendarsForIdsKey<T extends DiaryColumnCalendar>(
  calendars: readonly T[],
  idsKey: string,
): T[] {
  if (idsKey === '') return [];
  const byId = new Map(calendars.map((c) => [c.id, c] as const));
  return idsKey.split(',').flatMap((id) => byId.get(id) ?? []);
}

/**
 * May a NEW booking or block be started on this column, or a booking dropped
 * onto it? Never on a paused one: its column is drawn so the appointments
 * already on it are not missed, and for no other reason. The server refuses
 * the write anyway ("Staff not available"); this stops it with the reason.
 */
export function diaryColumnTakesNewBookings(
  calendar: Pick<DiaryColumnCalendar, 'is_active'>,
): boolean {
  return calendar.is_active;
}

/** The calendar's name as the chips and the week view list it: "Marcus (paused)". */
export function diaryColumnLabel(
  calendar: Pick<DiaryColumnCalendar, 'is_active'> & { name: string },
): string {
  return calendar.is_active ? calendar.name : `${calendar.name} (paused)`;
}

/** Said when an empty slot on a paused column is tapped. */
export function pausedColumnCreateMessage(name: string): string {
  return `${name} is paused, so nothing new can be booked here. Switch it back on under Calendar availability to take bookings again.`;
}

/**
 * How long the sentences below stay up as a toast. They explain rather than
 * confirm, and run to three lines on a phone, so the default 3.2 s is too short.
 */
export const PAUSED_COLUMN_TOAST_MS = 6000;

/** The engine's reason for refusing a booking written to a calendar that is switched off. */
const STAFF_NOT_AVAILABLE_REASON = 'Staff not available';

/**
 * A booking that sits on a paused calendar can be opened, cancelled and moved
 * to an active calendar, but the server refuses a new time or length while it
 * stays where it is, in the engine's words ("Staff not available"), which read
 * as if somebody were off sick. Says what is actually in the way, or null when
 * the refusal is about something else (the caller keeps the server's sentence).
 */
export function pausedColumnChangeRefusal(
  reason: string | null | undefined,
  pausedName: string | null | undefined,
): string | null {
  if (!pausedName || !reason?.includes(STAFF_NOT_AVAILABLE_REASON)) return null;
  return `${pausedName} is paused, so this booking cannot change time or length here. Move it to another calendar, or switch ${pausedName} back on.`;
}

/** Said when a booking is dropped onto a paused column. */
export function pausedColumnDropMessage(name: string): string {
  return `${name} is paused, so nothing can be moved here. Move it to another calendar, or switch ${name} back on first.`;
}
