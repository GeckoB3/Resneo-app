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
  /** Card holds: no-show fees charged against stored cards (kept separate from deposits collected). */
  no_show_fees_charged_pence?: number;
  no_show_fees_charged_count?: number;
  card_holds_active_count?: number;
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

/**
 * Table utilisation (`report5_table_utilisation`), for table-management venues
 * that are not on the appointment data model.
 * @see _reference/Resneo/src/app/api/venue/reports/route.ts (`tableUtilisation`)
 */
export interface ReportTableUtilisationRow {
  table_id: string;
  table_name: string;
  utilisation_pct: number;
  occupied_hours: number;
  available_hours: number;
}

/**
 * Tickets sold and revenue per event ticket tier (`report_event_ticket_tiers`),
 * from the immutable price snapshot on each ticket line. Events venues only.
 * @see _reference/Resneo/src/app/api/venue/reports/route.ts (`EventTicketTierRow`)
 */
export interface ReportEventTicketTierRow {
  /** Ticket type id, or a synthetic `label:<name>` key when the line predates a tier. */
  ticket_type_key: string;
  ticket_type_label: string;
  tickets_sold: number;
  revenue_pence: number;
  /** Distinct bookings that included at least one ticket of this tier. */
  booking_count: number;
}

/**
 * Booked hours against each resource's open hours (`report_resource_utilisation`).
 * Resource venues only.
 * @see _reference/Resneo/src/app/api/venue/reports/route.ts (`ResourceUtilisationRow`)
 */
export interface ReportResourceUtilisationRow {
  resource_id: string;
  resource_name: string;
  booking_count: number;
  occupied_hours: number;
  available_hours: number;
  utilisation_pct: number;
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
  report5_table_utilisation?: ReportTableUtilisationRow[] | null;
  report_event_ticket_tiers?: ReportEventTicketTierRow[] | null;
  report_resource_utilisation?: ReportResourceUtilisationRow[] | null;
  client_summary?: ReportClientSummary | null;
  booking_log_email_config?: BookingLogEmailConfig | null;
  default_booking_log_email?: string | null;
}

// ─── Booked revenue (web #191, `src/lib/reports/booked-revenue.ts`) ──────────
// GET /api/venue/reports/booked-revenue?preset=|from=&to=&grain= (admin only).

export type BookedRevenueGrain = 'day' | 'week' | 'month';

export type BookedRevenuePreset = 'today' | 'this_week' | 'this_month' | 'last_30' | 'next_30';

export interface BookedRevenueColumn {
  /** Stable key for `by_calendar`: the calendar id, or `unassigned`. */
  key: string;
  calendar_id: string | null;
  name: string;
  venue_id: string;
  venue_name: string;
  /** True for a calendar belonging to a linked venue. */
  linked: boolean;
  colour: string | null;
}

export interface BookedRevenueCell {
  /** Booked revenue in pence excluding no-shows. */
  booked_pence: number;
  /** Revenue of services marked No-Show in pence. */
  no_show_pence: number;
  /** Rows that contributed to `booked_pence`. */
  booked_count: number;
  no_show_count: number;
  /** Rows (booked or no-show) that carry no price and so add nothing. */
  unpriced_count: number;
}

export interface BookedRevenuePeriod extends BookedRevenueCell {
  /** First date of the period, YYYY-MM-DD (clamped to the requested range). */
  period_start: string;
  /** Last date of the period, YYYY-MM-DD (clamped to the requested range). */
  period_end: string;
  by_calendar: Record<string, BookedRevenueCell>;
}

export interface BookedRevenueReport {
  from: string;
  to: string;
  grain: BookedRevenueGrain;
  /** Today in the venue's timezone, so presets agree with the diary. */
  today: string;
  columns: BookedRevenueColumn[];
  periods: BookedRevenuePeriod[];
  totals: BookedRevenueCell & { by_calendar: Record<string, BookedRevenueCell> };
}
