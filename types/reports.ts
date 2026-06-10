/**
 * GET /api/venue/reports?from=&to= (admin only).
 * Shapes mirror _reference/reserve-ni/src/app/dashboard/reports/ReportsView.tsx.
 */
export interface ReportBookingSummary {
  total_bookings_created: number;
  by_source: Record<string, number>;
  by_status: Record<string, number>;
  covers_booked: number;
  covers_seated: number;
}

export interface ReportNoShowRow {
  period_start: string;
  no_show_count: number;
  confirmed_at_time_count: number;
  rate_pct: number;
}

export interface ReportCancellation {
  total_bookings_created: number;
  cancelled_guest_initiated: number;
  cancelled_auto: number;
  cancellation_rate_pct: number;
}

export interface ReportDeposit {
  total_collected_pence: number;
  total_refunded_pence: number;
  total_forfeited_pence: number;
}

export interface ReportAppointmentInsights {
  by_practitioner: {
    practitioner_id: string;
    practitioner_name: string;
    booking_count: number;
    completed_count: number;
  }[];
  by_service: {
    service_id: string;
    service_name: string;
    booking_count: number;
  }[];
  by_booking_source: Record<string, number>;
  addon_revenue?: {
    total_pence: number;
    bookings_with_addons: number;
    top_addons: {
      addon_name_snapshot: string;
      addon_group_name_snapshot: string | null;
      bookings: number;
      revenue_pence: number;
      total_duration_minutes: number;
    }[];
  };
}

export interface ReportByModelRow {
  booking_model: string;
  label: string;
  booking_count: number;
  covers: number;
  cancelled_count: number;
  completed_count: number;
  checked_in_count: number;
  deposit_pence_collected: number;
}

export interface ReportClientSummary {
  identified_clients_total: number;
  new_clients_in_period: number;
  returning_clients_in_period: number;
  anonymous_visits_in_period: number;
}

export interface ReportsResponse {
  from: string;
  to: string;
  booking_model?: string;
  pricing_tier?: string | null;
  report1_booking_summary: ReportBookingSummary | null;
  report2_no_show_series: ReportNoShowRow[] | null;
  report3_cancellation: ReportCancellation | null;
  report4_deposit: ReportDeposit | null;
  report7_appointment_insights: ReportAppointmentInsights | null;
  report_by_booking_model?: ReportByModelRow[] | null;
  client_summary?: ReportClientSummary | null;
}
