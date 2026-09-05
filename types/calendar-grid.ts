/**
 * GET /api/venue/calendar-grid response shapes.
 * @see _reference/reserve-ni/src/app/api/venue/calendar-grid/route.ts
 */

import type { ProcessingTimeBlock } from '@/types/services-manage';

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
  /**
   * Multi-service visit key: several consecutive bookings for one guest share a
   * `group_booking_id`. Optional — older backends omit it.
   *
   * Consumed by `clusterCalendarBookings`, which merges the rows into ONE bar
   * spanning first start → latest end, and by the drag path, which moves and
   * resizes a visit through `/api/venue/visits/{id}/schedule` rather than
   * PATCHing whichever row the bar is keyed on.
   */
  group_booking_id?: string | null;
  /**
   * Per-person label on a group booking ("Person 1", a name…). Tells a
   * multi-service visit by ONE guest (no label) from a group booking of several
   * people (each labelled) — the latter must stay as separate bars.
   */
  person_label?: string | null;
  /**
   * What the booking is for (web #178, 2026-09-05; absent on an older
   * backend): the unified catalogue item, the legacy appointment service and
   * the chosen option. They find the service's processing pattern when the
   * booking carries no snapshot of its own.
   */
  appointment_service_id?: string | null;
  service_item_id?: string | null;
  service_variant_id?: string | null;
  /**
   * The processing-time blocks snapshotted on the booking, minutes from its
   * start. A snapshot wins EVEN WHEN EMPTY (a gap deliberately removed at
   * booking time stays removed); only null means "derive from the service or
   * option pattern". See `lib/calendar/processing-gaps`.
   */
  processing_time_blocks?: ProcessingTimeBlock[] | null;
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
