/**
 * Subset of GET /api/venue/dashboard-home payload for the mobile Today tab.
 * @see _reference/reserve-ni/src/lib/dashboard/dashboard-home-payload.ts
 */
export interface DashboardTodayStats {
  covers: number;
  bookings: number;
  confirmed: number;
  pending: number;
  seated: number;
  revenue: number;
  next_booking: { time: string; party_size: number } | null;
  peak_in_house_covers: number;
  concurrent_cap: number | null;
  peak_fill_percent: number | null;
  covers_in_house_now: number;
  arriving_within_30_min: number;
}

export interface DashboardRecentBooking {
  id: string;
  time: string;
  party_size: number;
  status: string;
  guest_name: string;
  deposit_status: string;
  kind_label?: string;
  booking_model?: string;
}

export interface DashboardHomePayload {
  booking_model?: string;
  pricing_tier?: string | null;
  enabled_models?: string[];
  today_by_booking_model?: Record<string, number>;
  table_focus_secondaries_enabled?: boolean;
  today: DashboardTodayStats;
  recent_bookings: DashboardRecentBooking[];
}
