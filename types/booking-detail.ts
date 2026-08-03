import type { CardHoldSummary } from '@/lib/booking/card-hold';
import type { BookingTimelineEventRow } from '@/lib/booking/booking-timeline';
import type { BookingModel } from '@/types/venue';

/** Booking lifecycle statuses — matches PostgreSQL enum and web dashboard. */
export const BOOKING_STATUSES = [
  'Pending',
  'Booked',
  'Confirmed',
  'Seated',
  'Completed',
  'No-Show',
  'Cancelled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Guest row embedded in GET /api/venue/bookings/[id]. */
export interface BookingDetailGuest {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  visit_count?: number | null;
  last_visit_date?: string | null;
  tags?: string[] | null;
  customer_profile_notes?: string | null;
}

export interface BookingTableAssignment {
  id: string;
  name: string;
}

/**
 * Whole-booking payment state derived live by the server from the paid deposit
 * plus the in-person payments ledger (Tap to Pay design doc §5.5).
 * `unpaid` / `deposit_paid` / `partially_paid` are NORMAL states, never errors.
 */
export type BookingPaymentState =
  | 'unpaid'
  | 'deposit_paid'
  | 'partially_paid'
  | 'paid'
  | 'refunded';

/**
 * One in-person payment ledger row (`booking_payments`) from the full booking
 * GET. Service-role table — the authenticated staff GET is the app's only read
 * path (§9). The refund action posts a row's `id` as `payment_id`.
 */
export interface BookingPaymentRow {
  id: string;
  /** Which booking of the visit the row is anchored to (§5.7); older payloads omit it. */
  booking_id?: string;
  method: 'card_present' | 'cash' | 'external' | 'online';
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  amount_pence: number;
  note: string | null;
  created_at: string;
}

/**
 * The visit behind a booking's balance (§5.7). A multi-service visit or group
 * booking is several `bookings` rows sharing a `group_booking_id`, and taking
 * payment settles all of them in ONE collection — so the balance staff see is
 * the visit's, not the opened line's. `booking_count` is 1 for a standalone
 * appointment, in which case there is nothing extra to tell staff.
 */
export interface VisitPayment {
  booking_count: number;
  booking_ids: string[];
  /** Visit price; null when any line's price cannot be resolved (§5.7). */
  total_pence: number | null;
  amount_paid_pence: number;
  balance_due_pence: number | null;
  /**
   * What each service of the visit costs, in visit order. Optional: older
   * payloads omit it, and the backend only resolves names for a real multi-line
   * visit (a standalone booking already carries `service_variant_name`).
   */
  lines?: VisitPaymentLine[];
}

/** One priced service of a visit. */
export interface VisitPaymentLine {
  booking_id: string;
  /** Service name when resolvable; null for an unnamed or non-variant line. */
  name: string | null;
  /** This line's price; null when it cannot be determined (§5.7). */
  total_pence: number | null;
}

/**
 * Sent email/SMS row merged from communication_logs + legacy communications.
 * @see _reference/Resneo/src/lib/booking/load-booking-detail-bundle.ts
 */
export interface BookingCommunicationRow {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
  recipient: string | null;
  error_message?: string | null;
}

/** Immutable add-on snapshot row stored at booking time (booking_addons). */
export interface BookingDetailAddon {
  id?: string;
  addon_id: string | null;
  addon_group_id?: string | null;
  addon_name_snapshot: string;
  addon_group_name_snapshot?: string | null;
  price_pence_at_booking: number;
  duration_minutes_at_booking: number;
}

/**
 * Mobile subset of GET /api/venue/bookings/[id] (and /summary prefetch).
 * @see _reference/reserve-ni/src/app/api/venue/bookings/[id]/route.ts
 */
export interface BookingDetail {
  id: string;
  status: BookingStatus;
  booking_date: string;
  /** HH:mm from API (full GET normalises to 5 chars). */
  booking_time: string;
  booking_end_time?: string | null;
  party_size: number;
  guest_id: string;
  guest: BookingDetailGuest | null;
  special_requests?: string | null;
  internal_notes?: string | null;
  dietary_notes?: string | null;
  occasion?: string | null;
  deposit_status?: string | null;
  deposit_amount_pence?: number | null;
  area_name?: string | null;
  service_variant_name?: string | null;
  service_variant_price_pence?: number | null;
  inferred_booking_model?: BookingModel | null;
  table_assignments?: BookingTableAssignment[];
  /** Add-on snapshots + totals (full GET). */
  addons?: BookingDetailAddon[];
  addons_total_price_pence?: number | null;
  addons_total_duration_minutes?: number | null;
  /** Attendance + arrival timestamps. */
  guest_attendance_confirmed_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
  client_arrived_at?: string | null;
  checked_in_at?: string | null;
  /** Booking origin ("Online", "Phone", "Walk-in"…) — full GET spreads the row. */
  source?: string | null;
  created_at?: string;
  /** Display name of who created the booking, when the API joins it (optional). */
  created_by_name?: string | null;
  /** Guest self-service cancel cutoff (ISO timestamp). */
  cancellation_deadline?: string | null;
  /** Appointment anchors (model B / unified). */
  appointment_service_id?: string | null;
  service_item_id?: string | null;
  practitioner_id?: string | null;
  calendar_id?: string | null;
  /** Practitioner/calendar display name when the API joins it (optional). */
  practitioner_name?: string | null;
  service_variant_id?: string | null;
  /** Service delivery location (web 2026-06: online / client-address services). */
  location_type?: string | null;
  client_address_line1?: string | null;
  client_address_line2?: string | null;
  client_address_city?: string | null;
  client_address_postcode?: string | null;
  /**
   * Online joining details (web 2026-08). Resolved live from the service — so a
   * corrected link reaches the team — by the FULL GET only; the /summary prefetch
   * spreads the booking row and never carries them.
   */
  online_meeting_url?: string | null;
  online_meeting_info?: string | null;
  /** Multi-service visit / group booking link (full GET spreads the row). */
  group_booking_id?: string | null;
  /** Per-person label on group people visits ("Person 1", a name…). */
  person_label?: string | null;
  /**
   * Card-hold summary (full GET, §9.1); null when the booking has no hold row.
   * Absent on the /summary prefetch — `resolveCardHoldUiState` falls back to an
   * enum-only state from `deposit_status` until the full payload lands.
   */
  card_hold?: CardHoldSummary | null;
  /** Configured payment requirement of the booked service (full GET, optional). */
  service_payment_requirement?: string | null;
  /**
   * In-person payments (§6.6). These are VISIT-scoped (§5.7): taking payment
   * settles every booking sharing this one's `group_booking_id`, so
   * `amount_paid_pence`, `payment_state` and `balance_due_pence` cover the
   * whole visit. `booking_total_price_pence` stays THIS row's resolved price.
   * `balance_due_pence` is null when the price cannot be resolved — the Take
   * payment sheet then requires a staff-entered amount (§5.7).
   */
  booking_total_price_pence?: number | null;
  amount_paid_pence?: number | null;
  payment_state?: BookingPaymentState | null;
  balance_due_pence?: number | null;
  /** Visit breakdown behind the balance above (§5.7); absent on older payloads. */
  visit_payment?: VisitPayment | null;
  /** In-person payment ledger rows (full GET only; newest first). Visit-wide. */
  payments?: BookingPaymentRow[];
  /** Present on full GET; summary returns empty arrays. */
  events?: BookingTimelineEventRow[];
  communications?: BookingCommunicationRow[];
}

/** PATCH /api/venue/bookings/[id] — status-only updates for v1 mobile actions. */
export interface UpdateBookingStatusPayload {
  status: BookingStatus;
}
