/**
 * Guest directory row from GET /api/venue/guests.
 * @see _reference/Resneo/src/app/api/venue/guests/route.ts
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
  created_at?: string;
  /** 'identified' | 'anonymous' — identifies walk-ins vs full contacts. */
  identifiability_tier?: string;
  next_booking_date: string | null;
  next_booking_time: string | null;
  total_bookings: number;
  upcoming_booking_count: number;
  cancelled_count?: number;
  paid_deposit_pence?: number;
  marketing_opt_out?: boolean;
  marketing_consent?: boolean;
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
  /** Segment filter: 'all' | 'new' | 'upcoming' | 'visit' | 'marketing' | 'last_staff' | 'last_service' | 'tag' */
  segment?: string;
  /** Date range for segment filters (ISO date strings). */
  date_from?: string;
  date_to?: string;
  /** Marketing consent filter: 'opted_in' | 'opted_out' | 'no_record' */
  marketing?: string;
  /** Staff member UUID for last_staff segment. */
  last_staff_id?: string;
  /** Service UUID for last_service segment. */
  last_service_id?: string;
  /** Identity scope: 'identified' | 'all' | 'anonymous' */
  filter?: string;
}
