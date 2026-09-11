import {
  buildEventTicketTiersCsv,
  buildReport1Csv,
  buildReport2Csv,
  buildReport3Csv,
  buildReport4Csv,
  buildReport5Csv,
  buildReport7Csv,
  buildResourceUtilisationCsv,
  noShowOverallRatePct,
  showTableUtilisation,
  webSourceRows,
  type ReportCsvContext,
} from '@/lib/reports/overview-report';
import type {
  ReportAppointmentInsights,
  ReportBookingSummary,
  ReportCancellation,
  ReportDeposit,
  ReportNoShowRow,
} from '@/types/reports';

/**
 * Reports overview. Every export here has to open the same as the web's, so
 * these pin the filenames, headers, row labels and order against
 * `_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx`.
 */

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

const APPOINTMENT: ReportCsvContext = {
  appointment: true,
  terminology: { client: 'Client', booking: 'Appointment', staff: 'Practitioner' },
};

const TABLES: ReportCsvContext = {
  appointment: false,
  terminology: { client: 'Guest', booking: 'Reservation', staff: 'Staff' },
};

const summary: ReportBookingSummary = {
  total_bookings_created: 12,
  by_source: { online: 5, phone: 3, staff: 1 },
  by_status: { Confirmed: 7, Seated: 2 },
  covers_booked: 20,
  covers_seated: 9,
};

const series: ReportNoShowRow[] = [
  { period_start: '2026-09-01', no_show_count: 1, confirmed_at_time_count: 4, rate_pct: 25 },
  { period_start: '2026-09-02', no_show_count: 0, confirmed_at_time_count: 0, rate_pct: 0 },
];

const cancellation: ReportCancellation = {
  total_bookings_created: 12,
  cancelled_guest_initiated: 2,
  cancelled_auto: 1,
  cancellation_rate_pct: 25,
};

const deposit: ReportDeposit = {
  total_collected_pence: 4500,
  total_refunded_pence: 1000,
  total_forfeited_pence: 500,
  no_show_fees_charged_pence: 2000,
  no_show_fees_charged_count: 2,
  card_holds_active_count: 3,
};

const insights: ReportAppointmentInsights = {
  by_practitioner: [
    { practitioner_id: 'p1', practitioner_name: 'Hannah', booking_count: 6, completed_count: 4 },
  ],
  by_service: [{ service_id: 's1', service_name: 'Cut & finish', booking_count: 6 }],
  by_booking_source: { online: 4, phone: 2 },
};

describe('webSourceRows', () => {
  it('uses the web’s labels, merges onto them and sorts by volume', () => {
    expect(webSourceRows({ online: 2, booking_page: 5, widget: 1 })).toEqual([
      { name: 'Booking page', value: 5 },
      { name: 'Online', value: 2 },
      { name: 'Website widget', value: 1 },
    ]);
  });

  it('leaves a key the web does not name exactly as it arrived', () => {
    expect(webSourceRows({ staff: 3 })).toEqual([{ name: 'staff', value: 3 }]);
  });
});

describe('noShowOverallRatePct', () => {
  it('is 0 for an empty series, and 0 when nothing was eligible', () => {
    expect(noShowOverallRatePct([])).toBe(0);
    expect(
      noShowOverallRatePct([
        { period_start: '2026-09-01', no_show_count: 0, confirmed_at_time_count: 0, rate_pct: 0 },
      ]),
    ).toBe(0);
  });

  it('divides the whole series, not day by day', () => {
    expect(noShowOverallRatePct(series)).toBe(25);
  });
});

describe('showTableUtilisation', () => {
  it('is for table venues with table management on', () => {
    expect(showTableUtilisation('table_reservation', true)).toBe(true);
    expect(showTableUtilisation('table_reservation', false)).toBe(false);
    expect(showTableUtilisation('unified_scheduling', true)).toBe(false);
    expect(showTableUtilisation('practitioner_appointment', true)).toBe(false);
  });
});

describe('report 1 CSV', () => {
  it('names the metrics with the venue’s words for an appointment venue', () => {
    const csv = buildReport1Csv(summary, RANGE, APPOINTMENT);
    expect(csv.filename).toBe('report1-booking-summary-2026-09-01-2026-09-30.csv');
    expect(csv.rows.slice(0, 4)).toEqual([
      ['Metric', 'Value'],
      ['Appointments created in period', '12'],
      ['Total client places booked (headcount)', '20'],
      ['Clients arrived, started, or completed (headcount)', '9'],
    ]);
    // Source section, then status with the appointment label for Seated.
    expect(csv.rows).toContainEqual(['By source (created)', '']);
    expect(csv.rows).toContainEqual(['Online', '5']);
    expect(csv.rows).toContainEqual(['By status', '']);
    expect(csv.rows).toContainEqual(['Started', '2']);
  });

  it('keeps the covers wording, and raw statuses, for a table venue', () => {
    const csv = buildReport1Csv(summary, RANGE, TABLES);
    expect(csv.rows.slice(1, 4)).toEqual([
      ['Total bookings created', '12'],
      ['Covers booked', '20'],
      ['Covers seated', '9'],
    ]);
    expect(csv.rows).toContainEqual(['Seated', '2']);
  });
});

describe('report 2 CSV', () => {
  it('uses the web filename and its two header shapes', () => {
    const appt = buildReport2Csv(series, RANGE, APPOINTMENT);
    expect(appt.filename).toBe('report2-no-show-rate-2026-09-01-2026-09-30.csv');
    expect(appt.rows[0]).toEqual(['Date', 'No-shows', 'Attended or no-show (count)', 'Rate %']);
    expect(appt.rows[1]).toEqual(['2026-09-01', '1', '4', '25']);
    expect(buildReport2Csv(series, RANGE, TABLES).rows[0]).toEqual([
      'Date',
      'No-shows',
      'Denominator',
      'Rate %',
    ]);
  });
});

describe('report 3 CSV', () => {
  it('labels the cancellation rows the web’s way', () => {
    const csv = buildReport3Csv(cancellation, RANGE, APPOINTMENT);
    expect(csv.filename).toBe('report3-cancellation-2026-09-01-2026-09-30.csv');
    expect(csv.rows).toEqual([
      ['Metric', 'Value'],
      ['Appointments created in period', '12'],
      ['Cancelled (client-initiated)', '2'],
      ['Cancelled (auto)', '1'],
      ['Cancellation rate %', '25'],
    ]);
    expect(buildReport3Csv(cancellation, RANGE, TABLES).rows[2]).toEqual([
      'Cancelled (guest-initiated)',
      '2',
    ]);
  });
});

describe('report 4 CSV', () => {
  it('is the web’s deposit grid, card holds included', () => {
    const csv = buildReport4Csv(deposit, RANGE);
    expect(csv.filename).toBe('report4-deposit-2026-09-01-2026-09-30.csv');
    expect(csv.rows).toEqual([
      ['Metric', 'Pence', 'GBP'],
      ['Total collected', '4500', '45.00'],
      ['Total refunded', '1000', '10.00'],
      ['Total forfeited', '500', '5.00'],
      ['No-show fees charged (2)', '2000', '20.00'],
      ['Active card holds', '3', ''],
    ]);
  });
});

describe('report 5 CSV', () => {
  it('is the web’s table utilisation grid', () => {
    const csv = buildReport5Csv(
      [
        {
          table_id: 't1',
          table_name: 'Window 4',
          utilisation_pct: 62,
          occupied_hours: 7.5,
          available_hours: 12,
        },
      ],
      RANGE,
    );
    expect(csv.filename).toBe('report5-table-utilisation-2026-09-01-2026-09-30.csv');
    expect(csv.rows).toEqual([
      ['Table', 'Utilisation %', 'Occupied hours', 'Available hours'],
      ['Window 4', '62', '7.5', '12'],
    ]);
  });
});

describe('report 7 CSV', () => {
  it('carries the venue’s staff and booking words in its headers', () => {
    const csv = buildReport7Csv(insights, RANGE, APPOINTMENT);
    expect(csv.filename).toBe('report7-appointment-insights-2026-09-01-2026-09-30.csv');
    expect(csv.rows[0]).toEqual(['Practitioner', 'Appointments', 'Arrived or completed']);
    expect(csv.rows[1]).toEqual(['Hannah', '6', '4']);
    expect(csv.rows[2]).toEqual([]);
    expect(csv.rows[3]).toEqual(['Service', 'Appointments']);
    expect(csv.rows[5]).toEqual([]);
    expect(csv.rows[6]).toEqual(['Channel', 'Appointments in period']);
  });

  it('appends the three add-on total rows the web adds', () => {
    const csv = buildReport7Csv(
      {
        ...insights,
        addon_revenue: {
          total_pence: 3000,
          bookings_with_addons: 2,
          top_addons: [
            {
              addon_name_snapshot: 'Scalp massage',
              addon_group_name_snapshot: 'Extras',
              bookings: 2,
              revenue_pence: 3000,
              total_duration_minutes: 20,
            },
          ],
        },
      },
      RANGE,
      APPOINTMENT,
    );
    expect(csv.rows).toContainEqual([
      'Add-on',
      'Group',
      'Appointments',
      'Revenue (pence)',
      'Revenue (£)',
      'Total minutes',
    ]);
    expect(csv.rows).toContainEqual([
      'Scalp massage',
      'Extras',
      '2',
      '3000',
      '30.00',
      '20',
    ]);
    expect(csv.rows.slice(-3)).toEqual([
      ['Add-on total revenue (pence)', '3000'],
      ['Add-on total revenue (£)', '30.00'],
      ['Appointments with add-ons', '2'],
    ]);
  });

  it('leaves the add-on block out when nothing was sold', () => {
    const csv = buildReport7Csv(insights, RANGE, APPOINTMENT);
    expect(csv.rows.some((row) => row[0] === 'Add-on total revenue (pence)')).toBe(false);
  });
});

describe('D2 CSVs', () => {
  it('exports event ticket tiers as the web does', () => {
    const csv = buildEventTicketTiersCsv(
      [
        {
          ticket_type_key: 'tt1',
          ticket_type_label: 'Early bird',
          tickets_sold: 12,
          revenue_pence: 24000,
          booking_count: 8,
        },
      ],
      RANGE,
    );
    expect(csv.filename).toBe('report-event-ticket-tiers-2026-09-01-2026-09-30.csv');
    expect(csv.rows).toEqual([
      ['Ticket type', 'Tickets sold', 'Bookings', 'Revenue (£)'],
      ['Early bird', '12', '8', '240.00'],
    ]);
  });

  it('exports resource utilisation as the web does', () => {
    const csv = buildResourceUtilisationCsv(
      [
        {
          resource_id: 'r1',
          resource_name: 'Studio A',
          booking_count: 5,
          occupied_hours: 6,
          available_hours: 40,
          utilisation_pct: 15,
        },
      ],
      RANGE,
    );
    expect(csv.filename).toBe('report-resource-utilisation-2026-09-01-2026-09-30.csv');
    expect(csv.rows).toEqual([
      ['Resource', 'Bookings', 'Utilisation %', 'Booked hours', 'Available hours'],
      ['Studio A', '5', '15', '6', '40'],
    ]);
  });
});
