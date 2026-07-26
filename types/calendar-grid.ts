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
  /** Attendance overlay — drives the calendar bar colour (arrived-waiting guests show amber). */
  client_arrived_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
  guest_attendance_confirmed_at?: string | null;
  /**
   * Whole-booking payment state — drives the "paid" glyph on the bar. Optional:
   * older backends omit it, and it is the denormalised column, so it can lag
   * (no glyph on a booking that is in fact settled) but never claims paid for
   * one that is not.
   */
  payment_state?: string | null;
}

export interface CalendarGridBlock {
  id: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  /** calendar_blocks.block_type — e.g. "manual" | "break" | "class_session" (plus "closed" for closures). */
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
