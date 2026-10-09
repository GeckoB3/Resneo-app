/**
 * The Takings tab against the web's TakingsSection: every card, the per-card CSVs and the monthly
 * tip records through the share sheet (only for people who may export), cash-ups when there are
 * any, payouts for admins only, and the range card's refusals.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/reports/SvgBarChart', () => ({ SvgBarChart: () => null }));
// Each date field, pressed, picks the date the test set for its label.
const mockDates: Record<string, string> = {};
jest.mock('@/components/ui/DatePickerField', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DatePickerField: (props: { accessibilityLabel: string; onChange: (v: string) => void }) =>
      React.createElement(Pressable, {
        accessibilityLabel: props.accessibilityLabel,
        onPress: () => props.onChange(mockDates[props.accessibilityLabel] ?? ''),
      }),
  };
});
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

let mockTakings: unknown;
let mockCashUps: unknown;
const mockTakingsArgs: unknown[][] = [];
const mockPayoutsCalls: unknown[][] = [];
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useTakingsRange: (...args: unknown[]) => {
    mockTakingsArgs.push(args);
    return { data: mockTakings, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() };
  },
  useCashUps: () => ({ data: mockCashUps, isLoading: false, isError: false, refetch: jest.fn() }),
  usePayoutsRange: (...args: unknown[]) => {
    mockPayoutsCalls.push(args);
    return { data: { connected: true, currency: 'GBP', payouts: [], truncated: false }, isLoading: false, isError: false, refetch: jest.fn() };
  },
  usePayoutDetailRange: () => ({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() }),
}));

import { TakingsSection } from '@/components/reports/pos/TakingsSection';

const zero = { payments_pence: 0, refunds_pence: 0, disputes_pence: 0, tips_pence: 0, net_pence: 0 };

function takings() {
  return {
    from: '2026-10-05',
    to: '2026-10-11',
    grain: 'day',
    today: '2026-10-09',
    currency: 'GBP',
    currency_symbol: '£',
    totals: { payments_pence: 12000, refunds_pence: -1500, disputes_pence: -2000, tips_pence: 800, net_pence: 10500, net_with_tips_pence: 11300, row_count: 4 },
    by_method: [{ ...zero, method: 'external', external_type_name: 'Treatwell', payments_pence: 4000, net_pence: 4000, row_count: 1 }],
    by_source: [{ ...zero, source: 'deposits', payments_pence: 2000, net_pence: 2000, row_count: 1 }],
    by_period: [{ ...zero, period_start: '2026-10-05', period_end: '2026-10-05', payments_pence: 12000 }],
    by_person: [{ staff_id: null, name: null, payments_pence: 2000, refunds_pence: 0, tips_pence: 0, net_pence: 2000 }],
    refunds: [{ source_type: 'booking_deposit_refund', reason: '', refund_count: 1, amount_pence: 1500, tip_pence: 0 }],
    disputes: [{ id: 'd1', status: 'needs_response', reason: null, amount_pence: 2000, evidence_due_by: '2026-10-20', opened_at: '2026-10-06T10:00:00Z', movement_pence: -2000 }],
    estimated: { first_exact_date: '2026-10-07', estimated_rows: 2, note: 'Figures before 7 Oct 2026 are estimated from older records.' },
    vat: {
      from: '2026-10-05',
      to: '2026-10-11',
      by_rate: [{ tax_code: 'S', tax_rate_bps: 2000, sales_pence: 12000, sales_vat_pence: 2000, refunds_pence: 0, refunds_vat_pence: 0, net_pence: 12000, net_vat_pence: 2000, net_ex_vat_pence: 10000 }],
      totals: { sales_pence: 12000, sales_vat_pence: 2000, refunds_pence: 0, refunds_vat_pence: 0, net_pence: 12000, net_vat_pence: 2000 },
      deposits_and_fees: { deposits_taken_pence: 2000, deposits_refunded_pence: 1500, fees_charged_pence: 0, fees_refunded_pence: 0, deposits_kept_on_cancellation_pence: 500 },
    },
    tips: {
      totals: { allocated_pence: 800, reversed_pence: 0, net_pence: 800, paid_pence: 0, due_pence: 800 },
      by_recipient: [{ calendar_id: 'c1', staff_id: null, name: 'Sam', allocation_kind: 'performer', net_pence: 800, paid_pence: 0, due_pence: 800 }],
    },
    can_export: true,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTakingsArgs.length = 0;
  mockPayoutsCalls.length = 0;
  mockTakings = takings();
  mockCashUps = { currency: 'GBP', can_see_expected: false, sessions: [], totals: { sessions: 0, variance_pence: 0, over_pence: 0, short_pence: 0 }, outside: { total_pence: 0, count: 0, rows: [] } };
});

it('opens on this week by day, as the web does, and shows every card', async () => {
  await render(<TakingsSection canExport isAdmin today="2026-10-09" />);
  expect(mockTakingsArgs[0]).toEqual([{ kind: 'preset', preset: 'this-week' }, 'day']);
  expect(screen.getByText('Takings, 5 Oct to 11 Oct 2026')).toBeTruthy();
  expect(screen.getByText('Figures before 7 Oct 2026 are estimated from older records.')).toBeTruthy();
  expect(screen.getByText('Disputes -£20')).toBeTruthy();
  expect(screen.getByText('Treatwell')).toBeTruthy();
  expect(screen.getByText('Online deposits')).toBeTruthy();
  expect(screen.getByText('Online, no team member')).toBeTruthy();
  expect(screen.getByText('Deposit refund')).toBeTruthy();
  expect(screen.getByText('No reason recorded')).toBeTruthy();
  expect(screen.getByText('Needs a response')).toBeTruthy();
  expect(screen.getByText('Tips by person')).toBeTruthy();
  expect(screen.getByText('VAT by rate')).toBeTruthy();
  expect(screen.getByText('20%')).toBeTruthy();
  expect(screen.getByText('Deposits kept after a cancellation or no-show')).toBeTruthy();
  expect(screen.getByText('Payouts and fees')).toBeTruthy();
  // No till was closed and no cash was taken outside one: no cash-ups card.
  expect(screen.queryByText('Cash-ups')).toBeNull();
});

it('downloads each card and the monthly tip records from the server', async () => {
  await render(<TakingsSection canExport isAdmin today="2026-10-09" />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export By payment method as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/takings?grain=day&preset=this-week&format=csv&card=by_method', accessToken: 'tok' }),
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Download tip records'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/tips?grain=day&preset=this-week&format=csv&kind=monthly' }),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export VAT by rate as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(expect.objectContaining({ path: expect.stringContaining('&card=vat') }));
});

it('offers no file to someone without export, and no payouts to staff', async () => {
  await render(<TakingsSection canExport={false} isAdmin={false} today="2026-10-09" />);
  expect(screen.queryByText('Export CSV')).toBeNull();
  expect(screen.queryByText('Download tip records')).toBeNull();
  expect(screen.queryByText('Payouts and fees')).toBeNull();
  expect(mockPayoutsCalls).toHaveLength(0);
});

it('shows cash-ups with the expected figure only when the server allows it', async () => {
  mockCashUps = {
    currency: 'GBP',
    can_see_expected: false,
    sessions: [
      { id: 's1', till_name: 'Front desk', business_date: '2026-10-06', closed_by_name: 'Sam', opening_float_pence: 5000, counted_cash_pence: 9500, variance_pence: -500, variance_reason: 'Short change' },
    ],
    totals: { sessions: 1, variance_pence: -500, over_pence: 0, short_pence: -500 },
    outside: { total_pence: 1200, count: 1, rows: [{ id: 'o1', business_date: '2026-10-06', amount_pence: 1200, handled_by_name: 'Jo' }] },
  };
  await render(<TakingsSection canExport isAdmin today="2026-10-09" />);
  expect(screen.getByText('Cash-ups')).toBeTruthy();
  expect(screen.getByText('Front desk')).toBeTruthy();
  expect(screen.queryByText('Expected')).toBeNull();
  expect(screen.getByText('Over £0, short £5, net -£5.')).toBeTruthy();
  expect(screen.getByText('Cash outside a till session: £12')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export Cash-ups as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/cash-ups?grain=day&preset=this-week&format=csv' }),
  );
});

it('changes range and grain, and refuses an inverted custom range', async () => {
  await render(<TakingsSection canExport isAdmin today="2026-10-09" />);
  await act(async () => {
    fireEvent.press(screen.getByText('Last month'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Month'));
  });
  expect(mockTakingsArgs[mockTakingsArgs.length - 1]).toEqual([{ kind: 'preset', preset: 'last-month' }, 'month']);
  await act(async () => {
    fireEvent.press(screen.getByText('Choose dates'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Apply'));
  });
  // The dates start from the report's own range, which is fine to apply.
  expect(mockTakingsArgs[mockTakingsArgs.length - 1]).toEqual([{ kind: 'custom', from: '2026-10-05', to: '2026-10-11' }, 'month']);

  mockDates['Takings From'] = '2026-10-20';
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Takings From'));
  });
  const before = mockTakingsArgs.length;
  await act(async () => {
    fireEvent.press(screen.getByText('Apply'));
  });
  expect(mockToast.info).toHaveBeenCalledWith('The end date must not be before the start date.');
  expect(mockTakingsArgs[mockTakingsArgs.length - 1]).toEqual(mockTakingsArgs[before - 1]);

  mockDates['Takings From'] = '2025-01-01';
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Takings From'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Apply'));
  });
  expect(mockToast.info).toHaveBeenLastCalledWith('Choose a range of 400 days or less.');
});
