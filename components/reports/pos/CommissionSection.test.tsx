/**
 * The Commission tab against the web's CommissionSection: one row per person with the totals row,
 * the no-rates note, "Changed since you exported it", a person's lines on a tap (each opening its
 * sale), and the summary and lines CSVs, after which the report is read again.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
const mockDownload = jest.fn(async (_args: { path: string }) => ({ ok: true as const, filename: 'x.csv' }));
jest.mock('@/lib/reports/pos-report-download', () => ({
  downloadReportFile: (args: { path: string }) => mockDownload(args),
}));
const mockRefetch = jest.fn();
let mockReport: Record<string, unknown>;
const mockLinesFor: (string | null)[] = [];
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useCommissionReport: () => ({ data: mockReport, isLoading: false, isFetching: false, isError: false, refetch: mockRefetch }),
  useCommissionLines: (_c: unknown, _g: unknown, person: string | null) => {
    mockLinesFor.push(person);
    return {
      data: person
        ? {
            lines: [
              {
                row_kind: 'refund',
                business_date: '2026-10-03',
                sale_id: 'sale-9',
                sale_number: 42,
                refund_id: 'r1',
                line_id: 'l1',
                item_type: 'service',
                item_name: 'Colour',
                person_key: person,
                person_name: 'Sam',
                share_bps: 5000,
                base_pence: -2000,
                rate_bps: 1000,
                commission_pence: -200,
              },
            ],
          }
        : undefined,
      isError: false,
      refetch: jest.fn(),
    };
  },
}));

import { CommissionSection } from '@/components/reports/pos/CommissionSection';

const person = {
  person_key: 'c:cal-1',
  calendar_id: 'cal-1',
  staff_id: null,
  person_name: 'Sam',
  service_base_pence: 10000,
  service_commission_pence: 1000,
  product_base_pence: 0,
  product_commission_pence: 0,
  voucher_base_pence: 0,
  voucher_commission_pence: 0,
  total_commission_pence: 1000,
  tips_pence: 300,
  sales_pence: 10000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLinesFor.length = 0;
  const { person_key: _k, calendar_id: _c, staff_id: _s, person_name: _n, ...totals } = person;
  mockReport = {
    from: '2026-10-01',
    to: '2026-10-09',
    rows: [person],
    totals,
    lines: null,
    changed: { exported_at: '2026-10-05T09:00:00Z', persons: ['c:cal-1'], lines: ['l1'] },
    has_rates: false,
    currency: 'GBP',
    receipt_prefix: 'R-',
    can_export: true,
  };
});

it('shows each person with the totals, the no-rates note and what changed since the export', async () => {
  await render(<CommissionSection today="2026-10-09" />);
  expect(screen.getByText("You haven't set any commission rates yet.")).toBeTruthy();
  expect(screen.getByText('Commission by person')).toBeTruthy();
  expect(screen.getByText('Sam')).toBeTruthy();
  expect(screen.getByText('Changed since you exported it on 5 October 2026')).toBeTruthy();
  expect(screen.getByText('Tips (for reference)')).toBeTruthy();
  expect(screen.getByText("Tips aren't commission. They're here so you can see everything in one place.")).toBeTruthy();
});

it("opens a person's lines, each linking to its sale", async () => {
  await render(<CommissionSection today="2026-10-09" />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Sam's sales"));
  });
  expect(mockLinesFor).toContain('c:cal-1');
  expect(screen.getByText('Refund on Sale R-42')).toBeTruthy();
  expect(screen.getByText('Credit changed after the export')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Refund on Sale R-42'));
  });
  expect(mockPush).toHaveBeenCalledWith('/checkout/sale-9');
});

it('exports the summary and every line, then reads the report again', async () => {
  await render(<CommissionSection today="2026-10-09" />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export Commission by person as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/pos/commission/report?grain=day&preset=this-month&format=csv&kind=summary' }),
  );
  expect(mockRefetch).toHaveBeenCalled();
  await act(async () => {
    fireEvent.press(screen.getByText("Export CSV: Everyone's sales"));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(expect.objectContaining({ path: expect.stringContaining('&format=csv&kind=lines') }));
});

it('offers no export without the export permission', async () => {
  mockReport = { ...mockReport, can_export: false };
  await render(<CommissionSection today="2026-10-09" />);
  expect(screen.queryByText('Export CSV')).toBeNull();
  expect(screen.queryByText("Export CSV: Everyone's sales")).toBeNull();
});
