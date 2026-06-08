/**
 * Subset of a row from GET /api/venue/bookings/list for the mobile Today list.
 * @see _reference/reserve-ni/src/app/api/venue/bookings/list/route.ts
 */
export interface BookingListRow {
  id: string;
  booking_date: string;
  booking_time: string | null;
  party_size: number;
  status: string;
  guest_name: string;
  deposit_status: string | null;
  booking_model?: string | null;
  booking_item_name?: string | null;
}

export interface BookingsListResponse {
  bookings: BookingListRow[];
}
