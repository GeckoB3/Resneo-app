/**
 * GET /api/venue/reports?from=&to= (admin only).
 * Shapes mirror _reference/Resneo/src/app/dashboard/reports/ReportsView.tsx.
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

// ── Report 8: Baseline Metrics ───────────────────────────────────────────────
export interface VenueBaselineNoShowMetrics {
  no_show_count: number;
  eligible_count: number;
  rate_pct: number;
}

export interface VenueBaselineRescheduleMetrics {
  modifications_count: number;
  modification_notifications_count: number;
  reschedule_via_email_rate_pct: number;
  guest_self_reschedule_count: number;
  staff_reschedule_count: number;
  unknown_actor_reschedule_count: number;
  guest_self_reschedule_rate_pct: number;
}

export interface VenueBaselineCancellationRebookMetrics {
  cancellations_with_guest: number;
  rebooked_within_7d: number;
  rebooked_within_30d: number;
  rebook_rate_7d_pct: number;
  rebook_rate_30d_pct: number;
  median_rebook_gap_hours: number | null;
  p75_rebook_gap_hours: number | null;
}

export interface VenueBaselineStaffTimeToBookMetrics {
  sample_count: number;
  median_duration_ms: number | null;
  p75_duration_ms: number | null;
  returning_guest: {
    sample_count: number;
    median_duration_ms: number | null;
  };
}

export interface VenueBaselineMetrics {
  period: { from: string; to: string };
  scope: 'appointments' | 'all';
  no_show: VenueBaselineNoShowMetrics;
  reschedule: VenueBaselineRescheduleMetrics;
  cancellation_rebook: VenueBaselineCancellationRebookMetrics;
  staff_time_to_book: VenueBaselineStaffTimeToBookMetrics;
  computed_at: string;
}

export interface BaselineMetricsSnapshot {
  period_start: string;
  period_end: string;
  snapshot_kind: string;
  created_at: string;
  metrics: VenueBaselineMetrics;
}

// ── Booking Log Email ────────────────────────────────────────────────────────
export interface BookingLogEmailScheduleEntry {
  day: number;
  time: string;
}

export interface BookingLogEmailConfig {
  enabled: boolean;
  recipient_email: string | null;
  schedule: BookingLogEmailScheduleEntry[];
}

// ── Full response shape ──────────────────────────────────────────────────────
export interface ReportsResponse {
  from: string;
  to: string;
  booking_model?: string;
  pricing_tier?: string | null;
  enabled_models?: string[];
  table_management_enabled?: boolean;
  report1_booking_summary: ReportBookingSummary | null;
  report2_no_show_series: ReportNoShowRow[] | null;
  report3_cancellation: ReportCancellation | null;
  report4_deposit: ReportDeposit | null;
  report7_appointment_insights: ReportAppointmentInsights | null;
  report8_baseline_metrics?: VenueBaselineMetrics | null;
  report8_baseline_snapshot?: BaselineMetricsSnapshot | null;
  report_by_booking_model?: ReportByModelRow[] | null;
  client_summary?: ReportClientSummary | null;
  booking_log_email_config?: BookingLogEmailConfig | null;
  default_booking_log_email?: string | null;
}
