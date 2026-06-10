import type { BookingStatus } from '@/types/booking-detail';

/**
 * Subset of GET /api/venue/day-sheet used by the mobile run-sheet.
 * @see _reference/reserve-ni/src/app/api/venue/day-sheet/route.ts
 */
export interface DaySheetBooking {
  id: string;
  booking_time: string;
  estimated_end_time: string | null;
  party_size: number;
  status: BookingStatus;
  deposit_status: string | null;
  deposit_amount_pence: number | null;
  dietary_notes: string | null;
  special_requests: string | null;
  occasion: string | null;
  guest_name: string;
  guest_phone: string | null;
  visit_count: number;
  guest_tags: string[];
  table_assignments?: { id: string; name: string }[];
}

export interface DaySheetPeriod {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  max_covers: number | null;
  booked_covers: number;
  bookings: DaySheetBooking[];
}

export interface DaySheetSummary {
  total_bookings: number;
  total_covers: number;
  covers_remaining: number | null;
  arriving_soon: number;
  venue_max_capacity: number | null;
  is_today: boolean;
}

export interface DaySheetResponse {
  date: string;
  venue_name: string;
  periods: DaySheetPeriod[];
  summary: DaySheetSummary;
}
