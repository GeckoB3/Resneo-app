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

export interface DashboardForecastDay {
  date: string;
  day: string;
  covers: number;
  bookings: number;
}

export interface DashboardHeatmapService {
  service_id: string;
  service_name: string;
  daily_total_covers: number;
  peak_in_house_covers: number;
  concurrent_cap: number | null;
  fill_percent: number | null;
}

export interface DashboardHeatmapDay {
  date: string;
  day: string;
  daily_total_covers: number;
  peak_in_house_covers: number;
  concurrent_cap: number | null;
  fill_percent: number | null;
  by_service?: DashboardHeatmapService[];
}

export interface DashboardAlert {
  type: string;
  message: string;
}

export interface DashboardSecondaryActivity {
  today: Pick<
    DashboardTodayStats,
    'covers' | 'bookings' | 'confirmed' | 'pending' | 'seated' | 'revenue' | 'next_booking'
  >;
  forecast: DashboardForecastDay[];
}

export interface DashboardHomePayload {
  booking_model?: string;
  pricing_tier?: string | null;
  active_booking_models?: string[];
  enabled_models?: string[];
  today_by_booking_model?: Record<string, number>;
  table_focus_secondaries_enabled?: boolean;
  secondary_booking_activity?: DashboardSecondaryActivity;
  heatmap?: DashboardHeatmapDay[];
  today: DashboardTodayStats;
  forecast?: DashboardForecastDay[];
  alerts?: DashboardAlert[];
  recent_bookings: DashboardRecentBooking[];
}
