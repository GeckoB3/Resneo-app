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
  deposit_status?: string | null;
  deposit_amount_pence?: number | null;
  area_name?: string | null;
  service_variant_name?: string | null;
  service_variant_price_pence?: number | null;
  inferred_booking_model?: BookingModel | null;
  table_assignments?: BookingTableAssignment[];
  /** Present on full GET; summary returns empty arrays. */
  events?: unknown[];
  communications?: unknown[];
}

/** PATCH /api/venue/bookings/[id] — status-only updates for v1 mobile actions. */
export interface UpdateBookingStatusPayload {
  status: BookingStatus;
}
