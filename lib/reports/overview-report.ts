/**
 * The Reports overview, as the web builds it
 * (_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx): which sections
 * show, the figures the app derives itself, and every CSV export — filename,
 * header, row labels and order exactly as the web writes them, so a report
 * exported from the phone opens the same as one exported from the dashboard.
 *
 * Pure: no React and no I/O, so each report can be pinned by a test.
 */
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { isUnifiedSchedulingVenue } from '@/lib/venue/venue-experience';
import type {
  ReportAppointmentInsights,
  ReportBookingSummary,
  ReportCancellation,
  ReportDeposit,
  ReportEventTicketTierRow,
  ReportNoShowRow,
  ReportResourceUtilisationRow,
  ReportTableUtilisationRow,
} from '@/types/reports';
import type { VenueTerminology } from '@/types/venue';

/** A built export: the file it is saved as, and its grid. */
export interface ReportCsv {
  filename: string;
  rows: string[][];
}

/** What the labels change with: the venue's words, and whether it is an appointment venue. */
export interface ReportCsvContext {
  /** The web's `appointmentDashboardExperience`. */
  appointment: boolean;
  terminology: VenueTerminology;
}

export interface ReportRange {
  from: string;
  to: string;
}

const pounds = (pence: number): string => (pence / 100).toFixed(2);

/**
 * Source keys → the labels the web's exports carry
 * (ReportsView.tsx `formatBookingSourceLabel`). The app's on-screen charts go
 * through `aggregateSourcesByLabel`, which also names `staff` and `unknown`;
 * the CSV stays byte-identical to the web's instead.
 */
const WEB_SOURCE_LABELS: Record<string, string> = {
  online: 'Online',
  phone: 'Phone',
  'walk-in': 'Walk-in',
  widget: 'Website widget',
  booking_page: 'Booking page',
};

/** Merge raw source keys onto the web's labels, busiest first (ReportsView.tsx:251). */
export function webSourceRows(bySource: Record<string, number>): { name: string; value: number }[] {
  const acc = new Map<string, number>();
  for (const [key, value] of Object.entries(bySource)) {
    const label = WEB_SOURCE_LABELS[key] ?? key;
    acc.set(label, (acc.get(label) ?? 0) + value);
  }
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// ─── Derived figures + section gating ────────────────────────────────────────

/**
 * The overall no-show rate the web prints (ReportsView.tsx:614-616): no-shows
 * over the eligible count, with the denominator floored at 1 — so an empty or
 * all-zero series reads 0.0%, it does not disappear.
 */
export function noShowOverallRatePct(series: ReportNoShowRow[]): number {
  if (series.length === 0) return 0;
  const noShows = series.reduce((sum, row) => sum + row.no_show_count, 0);
  const eligible = series.reduce((sum, row) => sum + row.confirmed_at_time_count, 0);
  return (noShows / Math.max(1, eligible)) * 100;
}

/**
 * Table utilisation is for table-management venues that are not on the
 * appointment data model (ReportsView.tsx:1190).
 */
export function showTableUtilisation(
  bookingModel: string | null | undefined,
  tableManagementEnabled: boolean | null | undefined,
): boolean {
  return !isUnifiedSchedulingVenue(bookingModel) && Boolean(tableManagementEnabled);
}

// ─── Report 1: booking summary / appointment activity ────────────────────────

export function buildReport1Csv(
  summary: ReportBookingSummary,
  range: ReportRange,
  ctx: ReportCsvContext,
): ReportCsv {
  const { appointment: appt, terminology } = ctx;
  return {
    filename: `report1-booking-summary-${range.from}-${range.to}.csv`,
    rows: [
      ['Metric', 'Value'],
      [
        appt ? `${terminology.booking}s created in period` : 'Total bookings created',
        String(summary.total_bookings_created),
      ],
      [
        appt
          ? `Total ${terminology.client.toLowerCase()} places booked (headcount)`
          : 'Covers booked',
        String(summary.covers_booked),
      ],
      [
        appt ? `${terminology.client}s arrived, started, or completed (headcount)` : 'Covers seated',
        String(summary.covers_seated),
      ],
      ['By source (created)', ''],
      ...webSourceRows(summary.by_source).map(({ name, value }) => [name, String(value)]),
      ['By status', ''],
      ...Object.entries(summary.by_status).map(([status, count]) => [
        appt ? bookingStatusDisplayLabel(status, false) : status,
        String(count),
      ]),
    ],
  };
}

// ─── Report 2: no-show rate ──────────────────────────────────────────────────

export function buildReport2Csv(
  series: ReportNoShowRow[],
  range: ReportRange,
  ctx: ReportCsvContext,
): ReportCsv {
  return {
    filename: `report2-no-show-rate-${range.from}-${range.to}.csv`,
    rows: [
      ctx.appointment
        ? ['Date', 'No-shows', 'Attended or no-show (count)', 'Rate %']
        : ['Date', 'No-shows', 'Denominator', 'Rate %'],
      ...series.map((row) => [
        row.period_start,
        String(row.no_show_count),
        String(row.confirmed_at_time_count),
        String(row.rate_pct),
      ]),
    ],
  };
}

// ─── Report 3: cancellation rate ─────────────────────────────────────────────

export function buildReport3Csv(
  cancellation: ReportCancellation,
  range: ReportRange,
  ctx: ReportCsvContext,
): ReportCsv {
  const { appointment: appt, terminology } = ctx;
  return {
    filename: `report3-cancellation-${range.from}-${range.to}.csv`,
    rows: [
      ['Metric', 'Value'],
      [
        appt ? `${terminology.booking}s created in period` : 'Total bookings created',
        String(cancellation.total_bookings_created),
      ],
      [
        appt
          ? `Cancelled (${terminology.client.toLowerCase()}-initiated)`
          : 'Cancelled (guest-initiated)',
        String(cancellation.cancelled_guest_initiated),
      ],
      ['Cancelled (auto)', String(cancellation.cancelled_auto)],
      ['Cancellation rate %', String(cancellation.cancellation_rate_pct)],
    ],
  };
}

// ─── Report 4: deposits / payments ───────────────────────────────────────────

export function buildReport4Csv(deposit: ReportDeposit, range: ReportRange): ReportCsv {
  return {
    filename: `report4-deposit-${range.from}-${range.to}.csv`,
    rows: [
      ['Metric', 'Pence', 'GBP'],
      [
        'Total collected',
        String(deposit.total_collected_pence),
        pounds(deposit.total_collected_pence),
      ],
      [
        'Total refunded',
        String(deposit.total_refunded_pence),
        pounds(deposit.total_refunded_pence),
      ],
      [
        'Total forfeited',
        String(deposit.total_forfeited_pence),
        pounds(deposit.total_forfeited_pence),
      ],
      // Card holds stay separate from deposits collected: a charged no-show fee
      // is not a deposit payment (spec §13).
      [
        `No-show fees charged (${deposit.no_show_fees_charged_count ?? 0})`,
        String(deposit.no_show_fees_charged_pence ?? 0),
        pounds(deposit.no_show_fees_charged_pence ?? 0),
      ],
      ['Active card holds', String(deposit.card_holds_active_count ?? 0), ''],
    ],
  };
}

// ─── Report 5: table utilisation ─────────────────────────────────────────────

export function buildReport5Csv(
  rows: ReportTableUtilisationRow[],
  range: ReportRange,
): ReportCsv {
  return {
    filename: `report5-table-utilisation-${range.from}-${range.to}.csv`,
    rows: [
      ['Table', 'Utilisation %', 'Occupied hours', 'Available hours'],
      ...rows.map((row) => [
        row.table_name,
        String(row.utilisation_pct),
        String(row.occupied_hours),
        String(row.available_hours),
      ]),
    ],
  };
}

// ─── Report 7: team, services & channels ─────────────────────────────────────

export function buildReport7Csv(
  insights: ReportAppointmentInsights,
  range: ReportRange,
  ctx: ReportCsvContext,
): ReportCsv {
  const bookingPlural = `${ctx.terminology.booking}s`;
  const addons = insights.addon_revenue;
  return {
    filename: `report7-appointment-insights-${range.from}-${range.to}.csv`,
    rows: [
      [ctx.terminology.staff, bookingPlural, 'Arrived or completed'],
      ...insights.by_practitioner.map((row) => [
        row.practitioner_name,
        String(row.booking_count),
        String(row.completed_count),
      ]),
      [],
      ['Service', bookingPlural],
      ...insights.by_service.map((row) => [row.service_name, String(row.booking_count)]),
      [],
      ['Channel', `${bookingPlural} in period`],
      ...webSourceRows(insights.by_booking_source).map(({ name, value }) => [name, String(value)]),
      ...(addons && addons.total_pence > 0
        ? [
            [],
            ['Add-on', 'Group', bookingPlural, 'Revenue (pence)', 'Revenue (£)', 'Total minutes'],
            ...addons.top_addons.map((row) => [
              row.addon_name_snapshot,
              row.addon_group_name_snapshot ?? '',
              String(row.bookings),
              String(row.revenue_pence),
              pounds(row.revenue_pence),
              String(row.total_duration_minutes),
            ]),
            [],
            ['Add-on total revenue (pence)', String(addons.total_pence)],
            ['Add-on total revenue (£)', pounds(addons.total_pence)],
            [`${bookingPlural} with add-ons`, String(addons.bookings_with_addons)],
          ]
        : []),
    ],
  };
}

// ─── D2: event ticket tiers + resource utilisation ───────────────────────────

export function buildEventTicketTiersCsv(
  rows: ReportEventTicketTierRow[],
  range: ReportRange,
): ReportCsv {
  return {
    filename: `report-event-ticket-tiers-${range.from}-${range.to}.csv`,
    rows: [
      ['Ticket type', 'Tickets sold', 'Bookings', 'Revenue (£)'],
      ...rows.map((row) => [
        row.ticket_type_label,
        String(row.tickets_sold),
        String(row.booking_count),
        pounds(row.revenue_pence),
      ]),
    ],
  };
}

export function buildResourceUtilisationCsv(
  rows: ReportResourceUtilisationRow[],
  range: ReportRange,
): ReportCsv {
  return {
    filename: `report-resource-utilisation-${range.from}-${range.to}.csv`,
    rows: [
      ['Resource', 'Bookings', 'Utilisation %', 'Booked hours', 'Available hours'],
      ...rows.map((row) => [
        row.resource_name,
        String(row.booking_count),
        String(row.utilisation_pct),
        String(row.occupied_hours),
        String(row.available_hours),
      ]),
    ],
  };
}
