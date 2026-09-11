/**
 * Reports screen — the Overview's gating, figures and exports, against the web
 * (_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx).
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`. Charts, the heavy child sections and the native date picker
 * are stubbed so each test is about what this screen decides.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ReportsResponse } from '@/types/reports';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockVenue = {
  venue: { timezone: 'Europe/London' } as { timezone: string } | null,
  terminology: { client: 'Client', booking: 'Appointment', staff: 'Practitioner' },
  pricingTier: 'appointments' as string | null,
  bookingModel: 'unified_scheduling' as string | null,
};
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => mockVenue }));

jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: 'admin' } }, isLoading: false }),
}));

jest.mock('@/lib/queries/useBookingsList', () => ({
  calendarDateInTimeZone: () => '2026-09-11',
}));

const mockReports = {
  data: undefined as ReportsResponse | undefined,
  isLoading: false,
  isError: false,
  isFetching: false,
  isRefetching: false,
  error: null as unknown,
  refetch: jest.fn(),
};
jest.mock('@/lib/queries/useReports', () => ({ useReports: () => mockReports }));

jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
  aggregateSourcesByLabel: (bySource: Record<string, number>) =>
    Object.entries(bySource)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
}));

// Sections with queries of their own, or charts that need a layout pass.
jest.mock('@/components/reports/HistorySection', () => ({ HistorySection: () => null }));
jest.mock('@/components/reports/BookedRevenueSection', () => ({ BookedRevenueSection: () => null }));
jest.mock('@/components/reports/BookingLogEmailCard', () => ({ BookingLogEmailCard: () => null }));
jest.mock('@/components/reports/DataExportCard', () => ({ DataExportCard: () => null }));
jest.mock('@/components/reports/BaselineMetricsCard', () => ({ BaselineMetricsCard: () => null }));
jest.mock('@/components/reports/ClientsTab', () => ({ ClientsTab: () => null }));
jest.mock('@/components/reports/SvgBarChart', () => ({ SvgBarChart: () => null }));

const mockDatePickerProps: {
  accessibilityLabel: string;
  minimumDate?: Date;
  maximumDate?: Date;
}[] = [];
jest.mock('@/components/ui/DatePickerField', () => ({
  DatePickerField: (props: { accessibilityLabel: string; minimumDate?: Date; maximumDate?: Date }) => {
    mockDatePickerProps.push(props);
    return null;
  },
}));

let mockLineData: { key: string; label: string; value: number }[] = [];
jest.mock('@/components/reports/SvgLineChart', () => ({
  SvgLineChart: (props: { data: { key: string; label: string; value: number }[] }) => {
    mockLineData = props.data;
    return null;
  },
}));

import ReportsScreen from '@/app/(app)/reports';
import { buildAndShareCsv } from '@/lib/reports/csv-export';

function reportsData(overrides: Partial<ReportsResponse> = {}): ReportsResponse {
  return {
    from: '2026-08-13',
    to: '2026-09-11',
    booking_model: 'unified_scheduling',
    pricing_tier: 'appointments',
    enabled_models: ['unified_scheduling'],
    table_management_enabled: false,
    report1_booking_summary: {
      total_bookings_created: 12,
      by_source: { online: 5, phone: 3 },
      by_status: { Confirmed: 7, Seated: 2 },
      covers_booked: 20,
      covers_seated: 9,
    },
    // Three days, none of them with any activity: the web plots them all and
    // still prints an overall rate.
    report2_no_show_series: [
      { period_start: '2026-09-01', no_show_count: 0, confirmed_at_time_count: 0, rate_pct: 0 },
      { period_start: '2026-09-02', no_show_count: 0, confirmed_at_time_count: 0, rate_pct: 0 },
      { period_start: '2026-09-03', no_show_count: 0, confirmed_at_time_count: 0, rate_pct: 0 },
    ],
    report3_cancellation: {
      total_bookings_created: 12,
      cancelled_guest_initiated: 2,
      cancelled_auto: 1,
      cancellation_rate_pct: 25,
    },
    report4_deposit: {
      total_collected_pence: 4500,
      total_refunded_pence: 0,
      total_forfeited_pence: 0,
    },
    // An appointment venue with nothing in range: the server still sends the
    // (empty) insights object.
    report7_appointment_insights: {
      by_practitioner: [],
      by_service: [],
      by_booking_source: {},
    },
    report_by_booking_model: [
      {
        booking_model: 'unified_scheduling',
        label: 'Appointments',
        booking_count: 8,
        covers: 8,
        cancelled_count: 1,
        completed_count: 5,
        checked_in_count: 6,
        deposit_pence_collected: 4500,
      },
      {
        booking_model: 'class_session',
        label: 'Classes',
        booking_count: 4,
        covers: 12,
        cancelled_count: 0,
        completed_count: 3,
        checked_in_count: 3,
        deposit_pence_collected: 0,
      },
    ],
    client_summary: {
      identified_clients_total: 40,
      new_clients_in_period: 5,
      returning_clients_in_period: 7,
      anonymous_visits_in_period: 3,
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDatePickerProps.length = 0;
  mockLineData = [];
  mockVenue.pricingTier = 'appointments';
  mockVenue.bookingModel = 'unified_scheduling';
  mockVenue.terminology = { client: 'Client', booking: 'Appointment', staff: 'Practitioner' };
  mockReports.data = reportsData();
});

describe('Reports overview range', () => {
  it('does not cap the custom range at today', async () => {
    await render(<ReportsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Custom'));
    });
    const start = mockDatePickerProps.filter((p) => p.accessibilityLabel === 'Report range start date');
    const end = mockDatePickerProps.filter((p) => p.accessibilityLabel === 'Report range end date');
    expect(start.length).toBeGreaterThan(0);
    expect(end.length).toBeGreaterThan(0);
    expect(mockDatePickerProps.every((p) => p.maximumDate === undefined)).toBe(true);
    // To still cannot go before From.
    expect(end[end.length - 1].minimumDate).toBeInstanceOf(Date);
  });
});

describe('Reports overview no-show card', () => {
  it('plots the whole series and prints 0.0% when nothing was eligible', async () => {
    await render(<ReportsScreen />);
    expect(mockLineData).toHaveLength(3);
    expect(screen.getByText('Overall rate')).toBeTruthy();
    expect(screen.getByText('0.0%')).toBeTruthy();
  });

  it('exports with the web filename and header', async () => {
    await render(<ReportsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export No-show rate as CSV'));
    });
    expect(buildAndShareCsv).toHaveBeenCalledWith(
      'report2-no-show-rate-2026-08-13-2026-09-11.csv',
      expect.arrayContaining([['Date', 'No-shows', 'Attended or no-show (count)', 'Rate %']]),
    );
  });
});

describe('Reports overview by booking type', () => {
  it('shows once two types have activity, with the web columns', async () => {
    await render(<ReportsScreen />);
    expect(screen.getByText('By booking type')).toBeTruthy();
    expect(screen.getByText('Covers / guests')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Checked in')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
  });

  it('stays hidden when only one type had activity', async () => {
    mockReports.data = reportsData({
      report_by_booking_model: [
        {
          booking_model: 'unified_scheduling',
          label: 'Appointments',
          booking_count: 8,
          covers: 8,
          cancelled_count: 1,
          completed_count: 5,
          checked_in_count: 6,
          deposit_pence_collected: 4500,
        },
      ],
    });
    await render(<ReportsScreen />);
    expect(screen.queryByText('By booking type')).toBeNull();
  });

  it('exports the web CSV', async () => {
    await render(<ReportsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export By booking type as CSV'));
    });
    expect(buildAndShareCsv).toHaveBeenCalledWith(
      'report-by-booking-type-2026-08-13-2026-09-11.csv',
      expect.arrayContaining([
        [
          'Booking type',
          'Bookings',
          'Covers / guests',
          'Completed',
          'Cancelled',
          'Checked in',
          'Deposits collected (£)',
        ],
      ]),
    );
  });
});

describe('Reports overview team + cancellation cards', () => {
  it('keeps the team card for an appointment venue with an empty range', async () => {
    await render(<ReportsScreen />);
    expect(screen.getByText('Team, services & channels')).toBeTruthy();
    expect(screen.getByText(/No appointment data in this range yet\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Team, services & channels as CSV'));
    });
    expect(buildAndShareCsv).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledWith(
      'There is no appointment breakdown to export for this period.',
    );
  });

  it('calls auto cancellations Auto (unpaid)', async () => {
    await render(<ReportsScreen />);
    expect(screen.getByText('Auto (unpaid)')).toBeTruthy();
    expect(screen.queryByText('Auto-cancelled')).toBeNull();
  });
});

describe('Reports overview per-model sections', () => {
  it('shows event ticket tiers and resource utilisation when the payload carries them', async () => {
    mockReports.data = reportsData({
      report_event_ticket_tiers: [
        {
          ticket_type_key: 'tt1',
          ticket_type_label: 'Early bird',
          tickets_sold: 12,
          revenue_pence: 24000,
          booking_count: 8,
        },
      ],
      report_resource_utilisation: [
        {
          resource_id: 'r1',
          resource_name: 'Studio A',
          booking_count: 5,
          occupied_hours: 6,
          available_hours: 40,
          utilisation_pct: 15,
        },
      ],
    });
    await render(<ReportsScreen />);
    expect(screen.getByText('Event ticket sales by tier')).toBeTruthy();
    expect(screen.getByText('Early bird')).toBeTruthy();
    expect(screen.getByText('Resource utilisation')).toBeTruthy();
    expect(screen.getByText('Studio A')).toBeTruthy();
  });

  it('leaves them out when the payload has none, and hides tables for an appointment venue', async () => {
    await render(<ReportsScreen />);
    expect(screen.queryByText('Event ticket sales by tier')).toBeNull();
    expect(screen.queryByText('Resource utilisation')).toBeNull();
    expect(screen.queryByText('Table utilisation')).toBeNull();
  });

  it('shows table utilisation for a table venue with table management on', async () => {
    mockVenue.pricingTier = null;
    mockVenue.bookingModel = 'table_reservation';
    mockVenue.terminology = { client: 'Guest', booking: 'Reservation', staff: 'Staff' };
    mockReports.data = reportsData({
      booking_model: 'table_reservation',
      pricing_tier: null,
      enabled_models: ['table_reservation'],
      table_management_enabled: true,
      report7_appointment_insights: null,
      report5_table_utilisation: [
        {
          table_id: 't1',
          table_name: 'Window 4',
          utilisation_pct: 62,
          occupied_hours: 7.5,
          available_hours: 12,
        },
      ],
    });
    await render(<ReportsScreen />);
    expect(screen.getByText('Table utilisation')).toBeTruthy();
    expect(screen.getByText('Window 4')).toBeTruthy();
  });
});

describe('Reports clients tab', () => {
  it('uses the web tile labels, the range as the sub-value, and the walk-in note', async () => {
    await render(<ReportsScreen />);
    // "Clients" is the sub-tab label; the overview card below shares the word,
    // so press every match — only the tab has a handler.
    await act(async () => {
      screen.getAllByText('Clients').forEach((node) => fireEvent.press(node));
    });
    expect(screen.getByText('Client directory')).toBeTruthy();
    expect(screen.getByText('Known clients (all-time)')).toBeTruthy();
    expect(screen.getByText('New this period')).toBeTruthy();
    expect(screen.getByText('Returning this period')).toBeTruthy();
    expect(screen.getByText('Anonymous appointments (period)')).toBeTruthy();
    expect(screen.getAllByText('2026-08-13 → 2026-09-11').length).toBeGreaterThan(1);
    expect(
      screen.getByText(
        'Walk-in visits without contact details are counted but not shown in the client list below.',
      ),
    ).toBeTruthy();
  });
});
