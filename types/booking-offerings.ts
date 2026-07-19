/**
 * Bookable-offering shapes for the multi-model new-booking form.
 *
 * These mirror the web's PUBLIC booking endpoints, which the web staff flow
 * also reads to list bookable items:
 *   · GET /api/booking/class-offerings   → ClassOfferingsResponse
 *   · GET /api/booking/event-offerings   → EventOfferingsResponse
 *   · GET /api/booking/resource-options  → ResourceOptionsResponse
 *   · GET /api/booking/availability      → ResourceAvailabilityResponse (resource branch)
 *
 * @see _reference/Resneo/src/lib/availability/class-session-engine.ts
 * @see _reference/Resneo/src/lib/availability/event-ticket-engine.ts
 * @see _reference/Resneo/src/lib/availability/resource-booking-engine.ts
 */

/**
 * `'card_hold'` (web 2026-07): no payment at booking; the card is saved and a
 * no-show fee may be charged. The public offering payloads resolve the venue's
 * `card_hold_deposits` flag server-side, so `'card_hold'` here implies the flag
 * is on and a positive fee is configured. The fee rides the same
 * `deposit_amount_pence` field as deposits (spec D5).
 */
export type BookingPaymentRequirement = 'none' | 'deposit' | 'full_payment' | 'card_hold';

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

/** One bookable class session (occurrence). Book against `instance_id`. */
export interface ClassAvailabilitySlot {
  instance_id: string;
  class_type_id: string;
  class_name: string;
  description: string | null;
  /** YYYY-MM-DD. */
  instance_date: string;
  /** HH:mm or HH:mm:ss (raw DB time). */
  start_time: string;
  duration_minutes: number;
  capacity: number;
  remaining: number;
  instructor_id: string | null;
  instructor_name: string | null;
  price_pence: number | null;
  payment_requirement: BookingPaymentRequirement;
  /** Per-person; the deposit ('deposit') or no-show fee ('card_hold'). */
  deposit_amount_pence: number | null;
  cancellation_notice_hours: number;
  requires_stripe_checkout: boolean;
  colour: string;
}

/** A class type summarised across its bookable sessions in the window. */
export interface ClassOfferingSummary {
  class_type_id: string;
  class_name: string;
  description: string | null;
  colour: string;
  price_pence: number | null;
  payment_requirement: BookingPaymentRequirement;
  deposit_amount_pence: number | null;
  instructor_name: string | null;
  /** Distinct dates (YYYY-MM-DD) with >=1 bookable session, sorted. */
  dates: string[];
  session_count: number;
}

export interface ClassOfferingsResponse {
  venue_id: string;
  from: string;
  to: string;
  classes: ClassOfferingSummary[];
  instances: ClassAvailabilitySlot[];
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventTicketTypeSlot {
  id: string;
  name: string;
  price_pence: number;
  /** Ticket-type capacity; null = inherits event capacity. */
  capacity: number | null;
  /** min(event remaining, ticket remaining). */
  remaining: number;
  sort_order: number;
}

/** One bookable event occurrence. Book against `event_id` + `ticket_lines`. */
export interface EventAvailabilitySlot {
  event_id: string;
  series_key: string;
  parent_event_id: string | null;
  event_name: string;
  /** YYYY-MM-DD. */
  event_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  image_url: string | null;
  total_capacity: number;
  remaining_capacity: number;
  payment_requirement: BookingPaymentRequirement;
  deposit_amount_pence: number | null;
  cancellation_notice_hours: number;
  ticket_types: EventTicketTypeSlot[];
}

/** An event series summarised across its occurrences in the window. */
export interface EventOfferingSummary {
  series_key: string;
  event_name: string;
  description: string | null;
  image_url: string | null;
  /** Distinct dates (YYYY-MM-DD) with >=1 bookable occurrence, sorted. */
  dates: string[];
  occurrence_count: number;
  from_price_pence: number | null;
  payment_requirement: BookingPaymentRequirement;
  deposit_amount_pence: number | null;
}

export interface EventOfferingsResponse {
  venue_id: string;
  from: string;
  to: string;
  events: EventOfferingSummary[];
  instances: EventAvailabilitySlot[];
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** A bookable resource (metadata only — no per-day slots). */
export interface ResourceOption {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
  payment_requirement: BookingPaymentRequirement | string;
  deposit_amount_pence: number | null;
  cancellation_notice_hours: number;
}

export interface ResourceOptionsResponse {
  venue_id: string;
  resources: ResourceOption[];
}

/** One bookable resource start time (end derived from the chosen duration). */
export interface ResourceSlot {
  resource_id: string;
  resource_name: string;
  /** HH:mm. */
  start_time: string;
  price_per_slot_pence: number | null;
}

export interface ResourceAvailabilityResult {
  id: string;
  name: string;
  resource_type: string | null;
  min_booking_minutes: number;
  max_booking_minutes: number;
  slot_interval_minutes: number;
  price_per_slot_pence: number | null;
  payment_requirement: BookingPaymentRequirement;
  deposit_amount_pence: number | null;
  cancellation_notice_hours: number;
  slots: ResourceSlot[];
}

export interface ResourceAvailabilityResponse {
  date: string;
  venue_id: string;
  resources: ResourceAvailabilityResult[];
}

// ---------------------------------------------------------------------------
// Create payload helpers
// ---------------------------------------------------------------------------

/** One event ticket line on the create payload (server requires this shape). */
export interface BookingTicketLine {
  ticket_type_id: string;
  label: string;
  quantity: number;
  unit_price_pence: number;
}
