/**
 * The Takings tab under the Reports calendar filter (web 90ff4d17): Takings is the money journal and
 * always the whole venue, so the calendar is never sent, to the figures, their CSVs, the tip
 * records, cash-ups or payouts, and with a calendar chosen the tab says so in the web's words.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/reports/SvgBarChart', () => ({ SvgBarChart: () => null }));
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
const mockDownload = jest.fn(async (_args: { path: string }) => ({ ok: true as const, filename: 'x.csv' }));
jest.mock('@/lib/reports/pos-report-download', () => ({
  downloadReportFile: (args: { path: string }) => mockDownload(args),
}));

const mockTakingsArgs: unknown[][] = [];
const mockCashUpsArgs: unknown[][] = [];
const mockPayoutsArgs: unknown[][] = [];
const mockZero = { payments_pence: 0, refunds_pence: 0, disputes_pence: 0, tips_pence: 0, net_pence: 0 };
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useTakingsRange: (...args: unknown[]) => {
    mockTakingsArgs.push(args);
    return {
      data: {
        from: '2026-10-05',
        to: '2026-10-11',
        grain: 'day',
        today: '2026-10-09',
        currency: 'GBP',
        currency_symbol: '£',
        totals: { ...mockZero, payments_pence: 12000, net_pence: 12000, net_with_tips_pence: 12000, row_count: 2 },
        by_method: [{ ...mockZero, method: 'card', external_type_name: null, payments_pence: 12000, net_pence: 12000, row_count: 2 }],
        by_source: [],
        by_period: [],
        by_person: [],
        refunds: [],
        disputes: [],
        estimated: { first_exact_date: null, estimated_rows: 0, note: null },
        vat: null,
        tips: { totals: { allocated_pence: 0, reversed_pence: 0, net_pence: 0, paid_pence: 0, due_pence: 0 }, by_recipient: [] },
        can_export: true,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    };
  },
  useCashUps: (...args: unknown[]) => {
    mockCashUpsArgs.push(args);
    return {
      data: {
        currency: 'GBP',
        can_see_expected: false,
        sessions: [
          { id: 's1', till_name: 'Front desk', business_date: '2026-10-06', closed_by_name: 'Sam', opening_float_pence: 5000, counted_cash_pence: 9500, variance_pence: 0, variance_reason: null },
        ],
        totals: { sessions: 1, variance_pence: 0, over_pence: 0, short_pence: 0 },
        outside: { total_pence: 0, count: 0, rows: [] },
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  },
  usePayoutsRange: (...args: unknown[]) => {
    mockPayoutsArgs.push(args);
    return { data: { connected: true, currency: 'GBP', payouts: [], truncated: false }, isLoading: false, isError: false, refetch: jest.fn() };
  },
  usePayoutDetailRange: () => ({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() }),
}));

import { TakingsSection } from '@/components/reports/pos/TakingsSection';
import { ReportCalendarProvider } from '@/components/reports/ReportCalendarFilter';

const HANNAH = { id: 'cal-1', name: 'Hannah' };
const WHOLE_VENUE_TAB = 'These figures are for the whole venue. Hannah stays chosen on the other tabs.';

function renderFiltered() {
  return render(
    <ReportCalendarProvider calendar={HANNAH} onClear={jest.fn()}>
      <TakingsSection canExport isAdmin today="2026-10-09" />
    </ReportCalendarProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTakingsArgs.length = 0;
  mockCashUpsArgs.length = 0;
  mockPayoutsArgs.length = 0;
});

it('never asks Takings, cash-ups or payouts for a calendar', async () => {
  await renderFiltered();
  const week = { kind: 'preset', preset: 'this-week' };
  expect(mockTakingsArgs[0]).toEqual([week, 'day', { reportsVisible: true }]);
  expect(mockCashUpsArgs[0]).toEqual([week, 'day', { reportsVisible: true }]);
  expect(mockPayoutsArgs[0]).toEqual([week, 'day', { reportsVisible: true }]);
});

it('says once, in the web words, that the tab is the whole venue', async () => {
  await renderFiltered();
  expect(screen.getAllByText(WHOLE_VENUE_TAB)).toHaveLength(1);
  expect(screen.queryByText(/^Showing/)).toBeNull();
});

it('says nothing about calendars while all calendars are chosen', async () => {
  await render(<TakingsSection canExport isAdmin today="2026-10-09" />);
  expect(screen.queryByText(/whole venue/)).toBeNull();
});

it('downloads the whole venue: no calendar on the CSVs, the tip records or cash-ups', async () => {
  await renderFiltered();
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export By payment method as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/takings?grain=day&preset=this-week&format=csv&card=by_method' }),
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Download tip records'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/tips?grain=day&preset=this-week&format=csv&kind=monthly' }),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export Cash-ups as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/cash-ups?grain=day&preset=this-week&format=csv' }),
  );
  expect(mockDownload.mock.calls.every(([args]) => !args.path.includes('calendar_id'))).toBe(true);
});
