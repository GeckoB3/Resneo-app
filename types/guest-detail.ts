import type { BookingModel } from '@/types/venue';

/**
 * Full guest detail returned by GET /api/venue/guests/[guestId].
 * @see _reference/reserve-ni/src/app/api/venue/guests/[guestId]/route.ts
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
}

export interface GuestDetailResponse {
  guest: GuestDetailProfile;
  stats: GuestDetailStats;
  booking_history: GuestBookingHistoryRow[];
  communications: unknown[];
  custom_field_definitions: unknown[];
}
