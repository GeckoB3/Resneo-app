/**
 * Subset of a row from GET /api/venue/bookings/list (the route returns far
 * more; these are the fields the mobile list renders/filters on).
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
  /** Appointment anchors — practitioner venues use practitioner_id, unified use calendar_id. */
  practitioner_id?: string | null;
  calendar_id?: string | null;
  /** Resolved column name for unified venues. */
  calendar_name?: string | null;
  appointment_service_id?: string | null;
  service_item_id?: string | null;
  service_variant_name?: string | null;
  addons_count?: number;
  booking_addon_labels?: string[];
  guest_attendance_confirmed_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
  client_arrived_at?: string | null;
  source?: string | null;
}

export interface BookingsListResponse {
  bookings: BookingListRow[];
}
