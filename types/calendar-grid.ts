/**
 * GET /api/venue/calendar-grid response shapes.
 * @see _reference/reserve-ni/src/app/api/venue/calendar-grid/route.ts
 */

export interface CalendarGridBooking {
  id: string;
  guestName: string;
  serviceName: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm — may be an empty string (fall back to a default duration). */
  endTime: string;
  status: string;
  /** Hex colour; usually null from this endpoint — fall back to the practitioner colour. */
  colour?: string | null;
}

export interface CalendarGridBlock {
  id: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  /** e.g. "break" | "closed". */
  type: string;
}

export interface CalendarGridSession {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
}

export interface CalendarGridWorkingHours {
  start: string;
  end: string;
}

export interface CalendarGridDay {
  date: string;
  workingHours: CalendarGridWorkingHours[];
  bookings: CalendarGridBooking[];
  blocks: CalendarGridBlock[];
  sessions: CalendarGridSession[];
}

export interface CalendarGridCalendar {
  calendarId: string;
  calendarName: string;
  dates: CalendarGridDay[];
}

export interface CalendarGridResponse {
  calendars: CalendarGridCalendar[];
}
