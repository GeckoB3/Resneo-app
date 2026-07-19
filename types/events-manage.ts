/**
 * Types for the in-app event (experience) setup/editing flow.
 *
 * Mirrors the GET/POST/PATCH /api/venue/experience-events zod schema and the web
 * dashboard's Event Manager form. Events are `experience_events` rows with their
 * ticket types in `event_ticket_types` (returned as the `ticket_types` relation).
 *
 * @see _reference/Resneo/src/app/api/venue/experience-events/route.ts (eventSchema)
 * @see _reference/Resneo/src/app/dashboard/event-manager/EventManagerView.tsx
 */

/** `'card_hold'` (web 2026-07): per-person no-show fee kept in `deposit_amount_pence` (spec D5). */
export type EventPaymentRequirement = 'none' | 'deposit' | 'full_payment' | 'card_hold';

/** One ticket tier. `id` is present on records read back; omit on new rows. */
export interface EventTicketType {
  id?: string;
  name: string;
  price_pence: number;
  capacity?: number | null;
  sort_order?: number;
}

/** Full event record returned by GET /api/venue/experience-events. */
export interface ManagedEvent {
  id: string;
  name: string;
  description: string | null;
  /** YYYY-MM-DD */
  event_date: string;
  /** HH:mm[:ss] */
  start_time: string;
  end_time: string;
  capacity: number;
  image_url: string | null;
  is_active?: boolean;
  /** Unified calendar column for staff placement; null = unassigned. */
  calendar_id: string | null;
  max_advance_booking_days?: number;
  min_booking_notice_hours?: number;
  cancellation_notice_hours?: number;
  allow_same_day_booking?: boolean;
  payment_requirement: EventPaymentRequirement;
  deposit_amount_pence: number | null;
  ticket_types: EventTicketType[];
}

/** GET /api/venue/experience-events response. */
export interface ManagedEventsResponse {
  events: ManagedEvent[];
}

/** One ticket row sent on write — `capacity`/`sort_order` optional. */
export interface EventTicketWriteInput {
  name: string;
  price_pence: number;
  capacity?: number | null;
  sort_order?: number;
}

/**
 * Shared write fields for POST + PATCH. `ticket_types` is REPLACE-ALL on PATCH —
 * always send the complete list to keep. `image_url` is omitted when empty (the
 * API maps '' / null to "unset").
 */
export interface EventWriteInput {
  name: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  image_url?: string;
  calendar_id: string | null;
  max_advance_booking_days: number;
  min_booking_notice_hours: number;
  cancellation_notice_hours: number;
  allow_same_day_booking: boolean;
  payment_requirement: EventPaymentRequirement;
  deposit_amount_pence: number | null;
  ticket_types: EventTicketWriteInput[];
  is_active?: boolean;
}

/**
 * Create-time schedule for a new event (POST only — PATCH is always single-date).
 * Discriminated union mirroring the server `scheduleSchema`:
 * - `single` (default) — one event on `event_date`.
 * - `weekly` — same weekday from `event_date` through `until_date` (inclusive).
 * - `custom` — one event per listed date (≥1; `event_date` should be `dates[0]`).
 */
export type EventScheduleInput =
  | { type: 'single' }
  | { type: 'weekly'; until_date: string }
  | { type: 'custom'; dates: string[] };

/** POST body — `schedule` is optional (server defaults to a single event). */
export type CreateEventInput = EventWriteInput & { schedule?: EventScheduleInput };
/** PATCH body — partial write fields plus the target id. */
export type UpdateEventInput = Partial<EventWriteInput> & { id: string };

/** POST /api/venue/experience-events 201 response. */
export interface CreateEventResponse {
  /** Number of event rows created (1 for `single`, N for weekly/custom). */
  created?: number;
  event_ids?: string[];
  /** Full record of the first created event (spread from the row). */
  id?: string;
}
