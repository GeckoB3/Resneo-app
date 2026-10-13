/**
 * Reports screen — the Overview's gating, figures and exports, against the web
 * (_reference/Resneo/src/app/dashboard/reports/ReportsView.tsx).
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`. Charts, the heavy child sections and the native date picker
 * are stubbed so each test is about what this screen decides.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { ReportBusinessOption, ReportCalendarOption, ReportsResponse } from '@/types/reports';

let mockParams: { tab?: string } = {};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams }));
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

let mockRole = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: mockRole } }, isLoading: false }),
}));
let mockVouchersFlag = false;
// Checkout's switch. Off with past sales is a venue that keeps its Takings and Sales history.
let mockPosOn = true;
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({
    data: {
      currency: 'GBP',
      feature_flags: { resolved: { pos_enabled: mockPosOn, pos_gift_vouchers_enabled: mockPosOn && mockVouchersFlag } },
    },
  }),
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
// Each call's arguments (from, to, enabled, calendarId): the calendar asked for is the last one.
const mockReportsArgs: unknown[][] = [];
jest.mock('@/lib/queries/useReports', () => ({
  useReports: (...args: unknown[]) => {
    mockReportsArgs.push(args);
    return mockReports;
  },
}));

// What the Showing picker offers (GET /api/venue/reports/calendars).
let mockCalendars: ReportCalendarOption[] = [];
let mockBusinesses: ReportBusinessOption[] = [];
jest.mock('@/lib/queries/useReportCalendars', () => ({
  useReportCalendars: () => ({
    data: {
      venue: { id: 'v1', name: 'Plus 1' },
      calendars: mockCalendars,
      businesses: mockBusinesses,
      together: mockBusinesses.length > 0 ? { name: 'Everyone together' } : null,
    },
  }),
}));
// The picker's sheet draws its children while open, as a plain view.
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, { testID: 'calendar-sheet' }, children) : null,
  };
});

/** What a mocked section reads from the screen's calendar filter: "takings calendar: Hannah". */
function MockCalendarText({ label }: { label: string }) {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const { useReportCalendar } = jest.requireActual<typeof import('@/components/reports/ReportCalendarFilter')>(
    '@/components/reports/ReportCalendarFilter',
  );
  return <Text>{`${label} calendar: ${useReportCalendar().calendar?.name ?? 'all'}`}</Text>;
}

// Takings and Sales (POS P7-4): the access answer is what decides the tab control. The real hook is
// gated on the venue's pos_enabled; here `mockPosAccess` stands for its answer (undefined = not asked).
let mockPosAccess: { visible: boolean; can_view: boolean; can_export?: boolean } | undefined;
jest.mock('@/lib/queries/usePos', () => ({
  usePosReportAccess: () => ({ data: mockPosAccess, isLoading: false }),
}));
const mockSectionProps: Record<string, unknown> = {};
jest.mock('@/components/reports/PosReportSections', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TakingsSection: (props: unknown) => {
      mockSectionProps.takings = props;
      return (
        <>
          <Text>takings-section</Text>
          <MockCalendarText label="takings" />
        </>
      );
    },
    SalesSection: () => (
      <>
        <Text>sales-section</Text>
        <MockCalendarText label="sales" />
      </>
    ),
    VouchersSection: () => <Text>vouchers-section</Text>,
    CommissionSection: () => <Text>commission-section</Text>,
  };
});
jest.mock('@/components/reports/pos/StaffPosReportsPanel', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { StaffPosReportsPanel: (props: { canExport: boolean }) => <Text>{`staff-panel export=${props.canExport}`}</Text> };
});

jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
  aggregateSourcesByLabel: (bySource: Record<string, number>) =>
    Object.entries(bySource)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
}));

// Sections with queries of their own, or charts that need a layout pass.
jest.mock('@/components/reports/HistorySection', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { HistorySection: () => <Text>history-section</Text> };
});
jest.mock('@/components/reports/BookedRevenueSection', () => ({
  BookedRevenueSection: () => <MockCalendarText label="revenue" />,
}));
jest.mock('@/components/reports/NewBookingsSection', () => ({ NewBookingsSection: () => null }));
jest.mock('@/components/reports/BookingLogEmailCard', () => ({ BookingLogEmailCard: () => null }));
const mockExportProps: { posKinds?: boolean }[] = [];
jest.mock('@/components/reports/DataExportCard', () => ({
  DataExportCard: (props: { posKinds?: boolean }) => {
    mockExportProps.push(props);
    return null;
  },
}));
jest.mock('@/components/reports/BaselineMetricsCard', () => ({ BaselineMetricsCard: () => null }));
jest.mock('@/components/reports/ClientsTab', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ClientsTab: () => <Text>clients-list</Text> };
});
// The SMS usage card has its own tests; here it only has to head the admin's reports.
jest.mock('@/components/reports/SmsUsageBanner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    SmsUsageBanner: ({ enabled }: { enabled?: boolean }) =>
      enabled ? React.createElement(Text, { testID: 'sms-usage' }, 'sms') : null,
  };
});
// Each bar chart's rows, so a test can read which bars a card drew.
const mockBarCharts: { label: string; value: number }[][] = [];
jest.mock('@/components/reports/SvgBarChart', () => ({
  SvgBarChart: (props: { data: { label: string; value: number }[] }) => {
    mockBarCharts.push(props.data);
    return null;
  },
}));

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
  mockPosAccess = undefined;
  mockParams = {};
  mockRole = 'admin';
  mockVouchersFlag = false;
  mockPosOn = true;
  mockExportProps.length = 0;
  mockReportsArgs.length = 0;
  mockCalendars = [];
  mockBusinesses = [];
  mockBarCharts.length = 0;
  mockReports.isError = false;
  mockReports.error = null;
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
    expect(screen.getAllByText('13 Aug to 11 Sep 2026').length).toBeGreaterThan(1);
    expect(
      screen.getByText(
        'Walk-in visits without contact details are counted but not shown in the client list below.',
      ),
    ).toBeTruthy();
  });
});

describe('Reports tabs for Checkout (POS app step 1)', () => {
  it("keeps the four-option control, with today's labels, when POS is off", async () => {
    await render(<ReportsScreen />);
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.queryByText('Takings')).toBeNull();
    expect(screen.queryByText('Sales')).toBeNull();
    expect(screen.queryByLabelText('Report tabs')).toBeNull();
  });

  it('keeps it too when the venue has the tabs but this login may not read them', async () => {
    mockPosAccess = { visible: true, can_view: false };
    await render(<ReportsScreen />);
    expect(screen.queryByText('Takings')).toBeNull();
  });

  it('shows Takings and Sales as a scrollable chip row, with Revenue renamed Booked value', async () => {
    mockPosAccess = { visible: true, can_view: true };
    await render(<ReportsScreen />);
    expect(screen.getByLabelText('Report tabs')).toBeTruthy();
    expect(screen.getByText('Booked value')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Takings'));
    });
    expect(screen.getByText('takings-section')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sales'));
    });
    expect(screen.getByText('sales-section')).toBeTruthy();
  });
});

describe('Reports POS tabs at full parity (web ReportsView)', () => {
  it('orders the chips as the web does, with Vouchers and Commission for admins', async () => {
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    mockVouchersFlag = true;
    await render(<ReportsScreen />);
    const labels = ['Overview', 'New bookings', 'Booked value', 'Takings', 'Sales', 'Vouchers', 'Commission', 'Clients'];
    for (const label of labels) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(screen.getByText('Vouchers'));
    });
    expect(screen.getByText('vouchers-section')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Commission'));
    });
    expect(screen.getByText('commission-section')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Takings'));
    });
    expect(mockSectionProps.takings).toEqual({ canExport: true, isAdmin: true, today: '2026-09-11' });
  });

  it('leaves Vouchers out while gift vouchers are off', async () => {
    mockPosAccess = { visible: true, can_view: true };
    await render(<ReportsScreen />);
    expect(screen.queryByText('Vouchers')).toBeNull();
    expect(screen.getByText('Commission')).toBeTruthy();
  });

  it('opens a POS tab from the link', async () => {
    mockPosAccess = { visible: true, can_view: true };
    mockParams = { tab: 'commission' };
    await render(<ReportsScreen />);
    expect(screen.getByText('commission-section')).toBeTruthy();
  });

  it('falls back to the Overview where the linked tab does not exist', async () => {
    mockParams = { tab: 'commission' };
    await render(<ReportsScreen />);
    expect(screen.queryByText('commission-section')).toBeNull();
    expect(screen.getByText('No-show rate')).toBeTruthy();
  });

  it('renames the deposits card and offers the POS export kinds where Takings shows', async () => {
    mockPosAccess = { visible: true, can_view: true };
    await render(<ReportsScreen />);
    expect(screen.getByText('Deposits by booking date')).toBeTruthy();
    expect(screen.queryByText('Payments & deposits')).toBeNull();
    expect(mockExportProps[mockExportProps.length - 1]?.posKinds).toBe(true);
  });

  it('keeps the old title and kinds elsewhere', async () => {
    await render(<ReportsScreen />);
    expect(screen.getByText('Payments & deposits')).toBeTruthy();
    expect(mockExportProps[mockExportProps.length - 1]?.posKinds).toBe(false);
  });
});

describe('Reports for a team member (web StaffPosReportsPanel)', () => {
  it('shows Takings and Sales only, with view_reports', async () => {
    mockRole = 'staff';
    mockPosAccess = { visible: true, can_view: true, can_export: false };
    await render(<ReportsScreen />);
    expect(screen.getByText('staff-panel export=false')).toBeTruthy();
    expect(screen.queryByText('No-show rate')).toBeNull();
  });

  it('asks them to see an admin without view_reports', async () => {
    mockRole = 'staff';
    mockPosAccess = { visible: true, can_view: false };
    await render(<ReportsScreen />);
    expect(screen.getByText('Ask an admin if you need to see the takings and sales reports.')).toBeTruthy();
  });

  it('keeps Reports admin only where there is no POS', async () => {
    mockRole = 'staff';
    await render(<ReportsScreen />);
    expect(screen.getByText('Reports are only available to venue admins.')).toBeTruthy();
  });
});

describe('Reports SMS usage card (web SmsUsageBanner)', () => {
  it('heads the Overview for an admin', async () => {
    await render(<ReportsScreen />);
    expect(screen.getByTestId('sms-usage')).toBeTruthy();
  });

  // Part 2 mock-up 3 (2026-10-11): SMS usage is about the plan, so it sits on the Overview only and
  // every other tab opens on its own figures.
  it.each(['revenue', 'new-bookings', 'clients', 'takings', 'sales'])('stays off the %s tab', async (tab) => {
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    mockParams = { tab };
    await render(<ReportsScreen />);
    expect(screen.queryByTestId('sms-usage')).toBeNull();
  });

  it('comes back when the Overview is chosen again', async () => {
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    mockParams = { tab: 'takings' };
    await render(<ReportsScreen />);
    expect(screen.getByText('takings-section')).toBeTruthy();
    expect(screen.queryByTestId('sms-usage')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Overview'));
    });
    expect(screen.getByTestId('sms-usage')).toBeTruthy();
  });

  it('is not shown to a team member', async () => {
    mockRole = 'staff';
    mockPosAccess = { visible: true, can_view: true, can_export: false };
    await render(<ReportsScreen />);
    expect(screen.queryByTestId('sms-usage')).toBeNull();
  });
});

// Checkout off with past sales (web `pos-access/route.ts`: visible = POS on OR a completed sale):
// the tabs follow the server's answer, not the switch, so the venue keeps its history.
describe('Reports with Checkout off but a sales history', () => {
  it('shows Takings and Sales when the server says the venue has them', async () => {
    mockPosOn = false;
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    await render(<ReportsScreen />);
    expect(screen.getByLabelText('Report tabs')).toBeTruthy();
    expect(screen.getByText('Booked value')).toBeTruthy();
    expect(screen.getByText('Deposits by booking date')).toBeTruthy();
    expect(mockExportProps[mockExportProps.length - 1]?.posKinds).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByText('Takings'));
    });
    expect(screen.getByText('takings-section')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sales'));
    });
    expect(screen.getByText('sales-section')).toBeTruthy();
  });

  it('leaves out Commission and Vouchers, whose routes need Checkout on', async () => {
    mockPosOn = false;
    mockVouchersFlag = true;
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    await render(<ReportsScreen />);
    expect(screen.getByText('Takings')).toBeTruthy();
    expect(screen.queryByText('Commission')).toBeNull();
    expect(screen.queryByText('Vouchers')).toBeNull();
  });

  it('opens the Takings link', async () => {
    mockPosOn = false;
    mockPosAccess = { visible: true, can_view: true };
    mockParams = { tab: 'takings' };
    await render(<ReportsScreen />);
    expect(screen.getByText('takings-section')).toBeTruthy();
  });

  it('sends a Commission link to the Overview', async () => {
    mockPosOn = false;
    mockPosAccess = { visible: true, can_view: true };
    mockParams = { tab: 'commission' };
    await render(<ReportsScreen />);
    expect(screen.queryByText('commission-section')).toBeNull();
    expect(screen.getByText('No-show rate')).toBeTruthy();
  });

  it('keeps the four-option control where the server says there is no history', async () => {
    mockPosOn = false;
    mockPosAccess = { visible: false, can_view: false };
    await render(<ReportsScreen />);
    expect(screen.queryByLabelText('Report tabs')).toBeNull();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.queryByText('Takings')).toBeNull();
    expect(screen.getByText('Payments & deposits')).toBeTruthy();
  });

  it('gives a team member with view_reports their Takings and Sales', async () => {
    mockPosOn = false;
    mockRole = 'staff';
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    await render(<ReportsScreen />);
    expect(screen.getByText('staff-panel export=true')).toBeTruthy();
  });
});

const HANNAH: ReportCalendarOption = { id: 'cal-hannah', name: 'Hannah', active: true };
const JENNY: ReportCalendarOption = { id: 'cal-jenny', name: 'Jenny', active: true };
const OLD_JO: ReportCalendarOption = { id: 'cal-jo', name: 'Jo', active: false };

/** What the Overview was last asked for (useReports' fourth argument: the scope and comparison). */
function lastOverviewScope(): { calendarId?: string | null; business?: string | null; compare?: string | null } {
  return (mockReportsArgs[mockReportsArgs.length - 1]?.[3] as ReturnType<typeof lastOverviewScope>) ?? {};
}

/** The calendar the Overview was last asked for. */
function lastOverviewCalendar(): unknown {
  return lastOverviewScope().calendarId ?? null;
}

async function chooseCalendar(label: string) {
  await act(async () => {
    fireEvent.press(screen.getByHintText('Opens the choices of what to show'));
  });
  await act(async () => {
    fireEvent.press(screen.getByRole('radio', { name: label }));
  });
}

describe('Reports calendar filter', () => {
  it('shows no picker until the venue has two calendars', async () => {
    mockCalendars = [HANNAH];
    await render(<ReportsScreen />);
    expect(screen.queryByHintText('Opens the choices of what to show')).toBeNull();
    expect(lastOverviewCalendar()).toBeNull();
  });

  it('lists All calendars and each calendar, labelling one no longer active', async () => {
    mockCalendars = [HANNAH, JENNY, OLD_JO];
    await render(<ReportsScreen />);
    expect(screen.getByRole('button', { name: 'Showing, All calendars' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the choices of what to show'));
    });
    expect(screen.getByText('Show figures for')).toBeTruthy();
    const radios = screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel as string);
    expect(radios).toEqual(['All calendars', 'Hannah', 'Jenny', 'Jo (no longer active)']);
    expect(screen.getByRole('radio', { name: 'All calendars' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
  });

  it('asks the Overview for the chosen calendar and says so from the answer', async () => {
    mockCalendars = [HANNAH, JENNY];
    await render(<ReportsScreen />);
    expect(lastOverviewCalendar()).toBeNull();
    mockReports.data = reportsData({ calendar: { id: 'cal-hannah', name: 'Hannah' } });
    await chooseCalendar('Hannah');
    expect(lastOverviewCalendar()).toBe('cal-hannah');
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Showing, Hannah' })).toBeTruthy();
    expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
  });

  it('says the figures are the whole venue when the answer carries no calendar', async () => {
    mockCalendars = [HANNAH, JENNY];
    await render(<ReportsScreen />);
    // Nothing is said while all calendars are chosen.
    expect(screen.queryByText('These figures are for the whole venue.')).toBeNull();
    await chooseCalendar('Jenny');
    expect(lastOverviewCalendar()).toBe('cal-jenny');
    expect(screen.queryByText(/^Showing .+ only\./)).toBeNull();
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
  });

  it('keeps the calendar while moving between tabs, and hands it to each section', async () => {
    mockCalendars = [HANNAH, JENNY];
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    await render(<ReportsScreen />);
    await chooseCalendar('Hannah');
    await act(async () => {
      fireEvent.press(screen.getByText('Booked value'));
    });
    expect(screen.getByText('revenue calendar: Hannah')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Takings'));
    });
    expect(screen.getByText('takings calendar: Hannah')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Sales'));
    });
    expect(screen.getByText('sales calendar: Hannah')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Overview'));
    });
    expect(screen.getByRole('button', { name: 'Showing, Hannah' })).toBeTruthy();
    expect(lastOverviewCalendar()).toBe('cal-hannah');
    // Back to all calendars: every section is the whole venue again.
    await chooseCalendar('All calendars');
    expect(lastOverviewCalendar()).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Takings'));
    });
    expect(screen.getByText('takings calendar: all')).toBeTruthy();
  });

  it("says what the Clients figures are for one calendar, in the web's words", async () => {
    mockCalendars = [HANNAH, JENNY];
    await render(<ReportsScreen />);
    await act(async () => {
      screen.getAllByText('Clients').forEach((node) => fireEvent.press(node));
    });
    mockReports.data = reportsData({ calendar: { id: 'cal-hannah', name: 'Hannah' } });
    await chooseCalendar('Hannah');
    expect(
      screen.getByText(
        'Showing Hannah only. Clients who booked on this calendar in these dates. Known clients are those who have ever booked on it. The directory below lists all your clients.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('clients-list')).toBeTruthy();
  });

  it("says what the Overview figures are for one calendar, in the web's words", async () => {
    mockCalendars = [HANNAH, JENNY];
    await render(<ReportsScreen />);
    mockReports.data = reportsData({ calendar: { id: 'cal-hannah', name: 'Hannah' } });
    await chooseCalendar('Hannah');
    expect(
      screen.getByText(
        'Showing Hannah only. Bookings on this calendar, and in rooms or other resources shown on it. A visit with services on more than one calendar counts once on each.',
      ),
    ).toBeTruthy();
  });

  it('greys the picker out on Takings and Vouchers, which are always the whole venue, and keeps the choice', async () => {
    mockCalendars = [HANNAH, JENNY];
    mockPosAccess = { visible: true, can_view: true, can_export: true };
    mockVouchersFlag = true;
    await render(<ReportsScreen />);
    await chooseCalendar('Hannah');
    for (const tab of ['Takings', 'Vouchers']) {
      await act(async () => {
        fireEvent.press(screen.getByText(tab));
      });
      expect(screen.getByRole('button', { name: 'Showing, All calendars' })).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ disabled: true }),
      );
    }
    await act(async () => {
      fireEvent.press(screen.getByText('Sales'));
    });
    expect(screen.getByRole('button', { name: 'Showing, Hannah' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: false }),
    );
    expect(screen.getByText('sales calendar: Hannah')).toBeTruthy();
  });

  it("shows the server's sentence when filtering is not ready yet, with the way back", async () => {
    mockCalendars = [HANNAH, JENNY];
    await render(<ReportsScreen />);
    const sentence = "Filtering by calendar isn't ready yet for this report.";
    mockReports.data = undefined;
    mockReports.isError = true;
    mockReports.error = new ApiError(sentence, 409, { error: sentence, code: 'CONFLICT' });
    await chooseCalendar('Hannah');
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    // The sections that load on their own still show: one refusal never blocks the rest.
    expect(screen.getByTestId('sms-usage')).toBeTruthy();
    expect(screen.getByText('history-section')).toBeTruthy();
    expect(mockExportProps.length).toBeGreaterThan(0);
    // The Clients tab keeps its list too.
    await act(async () => {
      screen.getAllByText('Clients').forEach((node) => fireEvent.press(node));
    });
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.getByText('clients-list')).toBeTruthy();
    mockReports.data = reportsData();
    mockReports.isError = false;
    mockReports.error = null;
    await act(async () => {
      fireEvent.press(screen.getByText('Show all calendars'));
    });
    expect(lastOverviewCalendar()).toBeNull();
    expect(screen.getByRole('button', { name: 'Showing, All calendars' })).toBeTruthy();
    expect(screen.getByText('Client directory')).toBeTruthy();
  });

  it("shows the server's sentence for a calendar it does not know", async () => {
    mockCalendars = [HANNAH, JENNY];
    await render(<ReportsScreen />);
    const sentence = "That isn't a calendar. Choose one from the list, or All calendars.";
    mockReports.data = undefined;
    mockReports.isError = true;
    mockReports.error = new ApiError(sentence, 400, {
      error: sentence,
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'calendar_id', message: sentence }],
    });
    await chooseCalendar('Jenny');
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.getByText('Show all calendars')).toBeTruthy();
  });

  it('keeps the usual error for any other failure', async () => {
    mockCalendars = [HANNAH, JENNY];
    mockReports.data = undefined;
    mockReports.isError = true;
    mockReports.error = new ApiError('Something went wrong on our side.', 500, { error: 'Something went wrong on our side.' });
    await render(<ReportsScreen />);
    await chooseCalendar('Hannah');
    expect(screen.getByText('Something went wrong on our side.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.queryByText('Show all calendars')).toBeNull();
  });
});

const LIGHT3: ReportBusinessOption = {
  venue_id: 'v2',
  name: 'Light 3',
  access: 'collective',
  all_calendars: true,
  calendars: [{ id: 'cal-jess', name: 'Jess', active: true }],
};

const HEADLINE = {
  bookings_created: 12,
  places_booked: 14,
  seen: 9,
  cancellation_rate_pct: 12.5,
  no_show_count: 1,
  no_show_rate_pct: 5,
  deposits_collected_pence: 5000,
  new_clients: 4,
  returning_clients: 6,
  anonymous_visits: 1,
};

describe('Reports Showing picker and comparison (release 1)', () => {
  it('offers your venue, each business and everyone together, and asks the Overview for the choice', async () => {
    mockCalendars = [HANNAH];
    mockBusinesses = [LIGHT3];
    await render(<ReportsScreen />);
    // One calendar of your own, but a business to choose: the picker shows.
    expect(screen.getByRole('button', { name: 'Showing, Plus 1: all calendars' })).toBeTruthy();
    expect(lastOverviewScope()).toEqual({ calendarId: null, business: null, compare: 'previous' });
    await act(async () => {
      fireEvent.press(screen.getByHintText('Opens the choices of what to show'));
    });
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'Plus 1: all calendars',
      'Hannah',
      'Light 3: all calendars',
      'Jess',
      'Everyone together',
    ]);
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Everyone together' }));
    });
    expect(lastOverviewScope()).toEqual({ calendarId: null, business: 'all', compare: 'previous' });
    await chooseCalendar('Jess');
    expect(lastOverviewScope()).toEqual({ calendarId: 'cal-jess', business: null, compare: 'previous' });
    expect(screen.getByRole('button', { name: 'Showing, Jess at Light 3' })).toBeTruthy();
    await chooseCalendar('Light 3: all calendars');
    expect(lastOverviewScope()).toEqual({ calendarId: null, business: 'v2', compare: 'previous' });
  });

  it("never hands Sales a partner's choice: the picker greys out and the choice stays for the other tabs", async () => {
    mockCalendars = [HANNAH, JENNY];
    mockBusinesses = [LIGHT3];
    mockPosAccess = { visible: true, can_view: true };
    await render(<ReportsScreen />);
    await chooseCalendar('Jess');
    await act(async () => {
      fireEvent.press(screen.getByText('Sales'));
    });
    // The till section reads no calendar at all.
    expect(screen.getByText('sales calendar: all')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Showing, Plus 1: all calendars' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    // No comparison on the till tabs.
    expect(screen.queryByText('Compare with')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Overview'));
    });
    expect(screen.getByRole('button', { name: 'Showing, Jess at Light 3' })).toBeTruthy();
    expect(lastOverviewCalendar()).toBe('cal-jess');
  });

  it('hands Sales your own calendar, as before', async () => {
    mockCalendars = [HANNAH, JENNY];
    mockBusinesses = [LIGHT3];
    mockPosAccess = { visible: true, can_view: true };
    await render(<ReportsScreen />);
    await chooseCalendar('Hannah');
    await act(async () => {
      fireEvent.press(screen.getByText('Sales'));
    });
    expect(screen.getByText('sales calendar: Hannah')).toBeTruthy();
  });

  it('sends the comparison and keeps it while moving between tabs', async () => {
    await render(<ReportsScreen />);
    expect(screen.getByText('Compare with')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Same dates last year'));
    });
    expect(lastOverviewScope().compare).toBe('last_year');
    await act(async () => {
      screen.getAllByText('Clients').forEach((node) => fireEvent.press(node));
    });
    expect(lastOverviewScope().compare).toBe('last_year');
    expect(screen.getByText('Same dates last year')).toBeTruthy();
  });

  it('shows the changes on the headline figures, and what they compare with', async () => {
    mockReports.data = reportsData({
      headline: HEADLINE,
      comparison: {
        basis: 'previous',
        from: '2026-07-14',
        to: '2026-08-12',
        figures: { ...HEADLINE, bookings_created: 10, places_booked: 14, seen: 0, cancellation_rate_pct: 10, no_show_rate_pct: 6, deposits_collected_pence: 10000 },
      },
    });
    await render(<ReportsScreen />);
    expect(screen.getByText('Changes compare with 14 Jul to 12 Aug 2026.')).toBeTruthy();
    expect(screen.getByLabelText('+20%')).toBeTruthy();
    expect(screen.getByLabelText('No change')).toBeTruthy();
    expect(screen.getByLabelText('Up from 0')).toBeTruthy();
    // A higher cancellation rate is worse; a lower no-show rate is better.
    expect(screen.getByLabelText('+2.5 pts')).toBeTruthy();
    expect(screen.getByLabelText('-1.0 pts')).toBeTruthy();
    expect(screen.getByLabelText('-50%')).toBeTruthy();
    expect(screen.getAllByText('Counted on the day each booking was made').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Counted by appointment date').length).toBeGreaterThanOrEqual(2);
  });

  it('shows no change pills from a server without a comparison', async () => {
    await render(<ReportsScreen />);
    expect(screen.queryByTestId('change-pill')).toBeNull();
    expect(screen.queryByText(/^Changes compare with/)).toBeNull();
  });

  it('lists each business for everyone together, on the Overview and the Clients tab', async () => {
    mockCalendars = [HANNAH];
    mockBusinesses = [LIGHT3];
    mockReports.data = reportsData({
      scope: { kind: 'together', name: 'Everyone together', business: null },
      headline: HEADLINE,
      by_business: [
        { venue_id: 'v1', venue_name: 'Plus 1', access: 'own', headline: HEADLINE },
        { venue_id: 'v2', venue_name: 'Light 3', access: 'collective', headline: { ...HEADLINE, bookings_created: 3, new_clients: 2 } },
      ],
    });
    await render(<ReportsScreen />);
    expect(screen.getByLabelText('By business')).toBeTruthy();
    expect(screen.getByText(/^Showing Everyone together: Plus 1 and Light 3\./)).toBeTruthy();
    expect(screen.getAllByText('Appointments created').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Deposits collected').length).toBe(2);
    await act(async () => {
      screen.getAllByText('Clients').forEach((node) => fireEvent.press(node));
    });
    expect(screen.getByLabelText('By business')).toBeTruthy();
    expect(screen.getAllByText('New clients').length).toBe(2);
    expect(screen.getAllByText('Returning clients').length).toBe(2);
    // A client of two businesses counts once at each.
    expect(screen.getByText(/A client who visits two businesses counts once at each\./)).toBeTruthy();
  });

  it('has no table by business for a single scope', async () => {
    mockReports.data = reportsData({ headline: HEADLINE, by_business: null });
    await render(<ReportsScreen />);
    expect(screen.queryByLabelText('By business')).toBeNull();
  });

  it('reads how they booked from the channels, and explains what a visit counts as', async () => {
    mockReports.data = reportsData({
      report7_appointment_insights: {
        by_practitioner: [],
        by_service: [],
        by_booking_source: { phone: 9 },
        by_channel: { online: 3, team: 2, walk_in: 0, linked_venue: 1 },
      },
    });
    await render(<ReportsScreen />);
    expect(mockBarCharts.some((data) => data.map((d) => d.label).join('|') === 'Online|By your team|By a linked venue')).toBe(true);
    expect(
      screen.getByText(
        'Visits in this date range that were not cancelled, split by practitioner (calendar), by service, and by how the client booked. A visit with several services counts once on each calendar and once for each service in it. The "Arrived or completed" bar counts marked arrival, started, or completed visits.',
      ),
    ).toBeTruthy();
  });
});
