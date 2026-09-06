import type { BookingModel } from '@/types/venue';

/**
 * Full guest detail returned by GET /api/venue/guests/[guestId].
 * @see _reference/Resneo/src/app/api/venue/guests/[guestId]/route.ts
 */
export interface GuestDetailProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  visit_count: number;
  no_show_count: number;
  last_visit_date: string | null;
  customer_profile_notes: string | null;
  created_at: string;
  updated_at: string;
  marketing_opt_out: boolean;
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  custom_fields: Record<string, unknown>;
  /** Contact address (client-address services). Null when not captured. */
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_postcode: string | null;
}

export interface GuestDetailStats {
  total_bookings: number;
  cancellations: number;
  no_shows: number;
  total_deposit_pence_paid: number;
  first_visit_date: string | null;
  last_visit_date: string | null;
  days_since_last_visit: number | null;
  days_as_customer: number;
}

export interface GuestBookingHistoryRow {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number | null;
  status: string;
  deposit_status: string | null;
  deposit_amount_pence: number | null;
  booking_model: BookingModel | string;
  kind_label: string;
  detail_label: string;
  practitioner_name: string | null;
  service_name: string | null;
  area_name: string | null;
  /**
   * The visit's end, as the route returns it: the server's estimate as an
   * instant, and the stored wall-clock end. They decide whether a visit is
   * still upcoming (`lib/guests/guest-history-sections`).
   */
  estimated_end_time?: string | null;
  booking_end_time?: string | null;
  /**
   * Anchor ids the GET route already returns (route maps them at
   * `guests/[guestId]` ~L333-339) — used to pre-seed a per-visit rebook. The app
   * just hadn't surfaced them. practitioner_id/calendar_id are the practitioner
   * anchors; appointment_service_id/service_item_id the service anchors.
   */
  practitioner_id?: string | null;
  appointment_service_id?: string | null;
  calendar_id?: string | null;
  service_item_id?: string | null;
  service_variant_id?: string | null;
}

/** Custom client field definition from the venue setup. */
export interface CustomClientFieldDefinition {
  id: string;
  venue_id: string;
  field_name: string;
  field_key: string;
  field_type: 'text' | 'number' | 'date' | 'boolean';
  is_active: boolean;
  created_at: string;
}

/** Row from guest communications history. */
export interface CommunicationRow {
  id: string;
  message_type: string;
  channel: string;
  status: string;
  created_at: string;
  booking_id: string | null;
  guest_id: string | null;
}

export interface GuestDetailResponse {
  guest: GuestDetailProfile;
  stats: GuestDetailStats;
  booking_history: GuestBookingHistoryRow[];
  communications: CommunicationRow[];
  custom_field_definitions: CustomClientFieldDefinition[];
}
