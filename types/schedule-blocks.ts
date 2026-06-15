/**
 * GET /api/venue/schedule response shapes.
 *
 * This feed is the venue-wide source for CLASSES, EVENTS and RESOURCE bookings
 * that DON'T live on the practitioner grid. It is DISJOINT from
 * `/api/venue/calendar-grid`'s `sessions`/`event_sessions` by design (the web
 * draws the calendar's class/event capacity blocks from THIS feed), so the two
 * never double-render — the calendar consumes both.
 *
 * @see _reference/Resneo/src/types/schedule-blocks.ts
 * @see _reference/Resneo/src/app/api/venue/schedule/route.ts
 */

export type ScheduleBlockKind = 'event_ticket' | 'class_session' | 'resource_booking';

/** JSON shape returned by GET /api/venue/schedule (the `blocks` array). */
export interface ScheduleBlockDTO {
  id: string;
  kind: ScheduleBlockKind;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm[:ss] */
  start_time: string;
  /** HH:mm[:ss] */
  end_time: string;
  title: string;
  subtitle?: string | null;
  booking_id?: string | null;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  status?: string | null;
  /** Left border / legend (hex), optional. */
  accent_colour?: string | null;
  /** Model D: total capacity for this class instance (when known). */
  class_capacity?: number | null;
  /** Model D: total spots booked (all guests) for this instance. */
  class_booked_spots?: number | null;
  /**
   * The practitioner/calendar column this block belongs to: class sessions
   * (from `class_types.instructor_id`) or ticketed events
   * (`experience_events.calendar_id`). May be null (unassigned).
   */
  calendar_id?: string | null;
  /** Model C: experience event capacity (when block is one row per event). */
  event_capacity?: number | null;
  /** Non-cancelled bookings count for this event occurrence. */
  event_booking_count?: number | null;
  /** Sum of party_size for those bookings. */
  event_party_total?: number | null;
  /** Non-cancelled bookings with `client_arrived_at` set. */
  event_arrived_count?: number | null;
}

/** Wrapper shape: the route returns `{ blocks }`. */
export interface ScheduleBlocksResponse {
  blocks: ScheduleBlockDTO[];
}

/**
 * Normalized, render-ready schedule block for the calendar grids. A pure view
 * of a {@link ScheduleBlockDTO} with the kind-specific capacity/colour logic
 * already resolved (see the mapper in the calendar screen).
 */
export type CalendarScheduleBlock = {
  id: string;
  kind: ScheduleBlockKind;
  /** HH:mm[:ss] */
  startTime: string;
  /** HH:mm[:ss] */
  endTime: string;
  title: string;
  subtitle?: string | null;
  /** Hex accent — drives the left bar + border + faint fill tint. */
  accent: string;
  /** e.g. "3/12 booked"; null when capacity is unknown. */
  capacityLabel?: string | null;
};
