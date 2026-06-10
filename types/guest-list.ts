/**
 * Guest directory row from GET /api/venue/guests.
 * @see _reference/reserve-ni/src/app/api/venue/guests/route.ts
 */
export interface GuestListItem {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  visit_count: number;
  no_show_count: number;
  last_visit_date: string | null;
  next_booking_date: string | null;
  next_booking_time: string | null;
  total_bookings: number;
  upcoming_booking_count: number;
}

export interface GuestListResponse {
  guests: GuestListItem[];
  total: number;
  page: number;
  limit: number;
  total_count: number;
}

export interface GuestListParams {
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  /** Filter to contacts carrying this tag (segment=tag). */
  segmentTag?: string;
}
