/**
 * Sales and Commission under the Reports calendar filter (the contract shared with the web,
 * 2026-10-12): each asks for the chosen calendar, CSVs and drill-down included, says what its
 * figures cover from the answer, and the Sales stock card stays the whole venue and says so.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/reports/SvgBarChart', () => ({ SvgBarChart: () => null }));
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'tok' }));
const mockDownload = jest.fn(async (_args: { path: string }) => ({ ok: true as const, filename: 'x.csv' }));
jest.mock('@/lib/reports/pos-report-download', () => ({
  downloadReportFile: (args: { path: string }) => mockDownload(args),
}));

let mockSales: Record<string, unknown>;
let mockCommission: Record<string, unknown>;
const mockSalesArgs: unknown[][] = [];
const mockCommissionArgs: unknown[][] = [];
const mockLinesArgs: unknown[][] = [];
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useSalesRange: (...args: unknown[]) => {
    mockSalesArgs.push(args);
    return { data: mockSales, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() };
  },
  useCommissionReport: (...args: unknown[]) => {
    mockCommissionArgs.push(args);
    return { data: mockCommission, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() };
  },
  useCommissionLines: (...args: unknown[]) => {
    mockLinesArgs.push(args);
    return { data: undefined, isError: false, refetch: jest.fn() };
  },
}));

import { CommissionSection } from '@/components/reports/pos/CommissionSection';
import { SalesSection } from '@/components/reports/pos/SalesSection';
import { ReportCalendarProvider } from '@/components/reports/ReportCalendarFilter';

const HANNAH = { id: 'cal-1', name: 'Hannah' };

function withCalendar(children: ReactNode, calendar: { id: string; name: string } | null = HANNAH) {
  return (
    <ReportCalendarProvider calendar={calendar} onClear={jest.fn()}>
      {children}
    </ReportCalendarProvider>
  );
}

const productFigures = {
  quantity: 1,
  discount_pence: 0,
  sales_pence: 2000,
  tax_pence: 333,
  refunds_pence: 0,
  revenue_ex_vat_pence: 1667,
  costed_revenue_ex_vat_pence: 1667,
  cost_of_goods_pence: 800,
  margin_pence: 867,
  margin_bps: 5200,
  units_restocked: 0,
  lines_without_cost: 0,
};

function sales(over: Record<string, unknown> = {}) {
  return {
    from: '2026-10-05',
    to: '2026-10-11',
    grain: 'day',
    today: '2026-10-09',
    currency: 'GBP',
    currency_symbol: '£',
    can_export: true,
    totals: {
      sales_count: 1,
      visit_count: 1,
      gross_pence: 2000,
      discount_pence: 0,
      sales_pence: 2000,
      tax_pence: 333,
      services_pence: 0,
      retail_pence: 2000,
      applied_pence: 0,
      refunds_pence: 0,
      refund_count: 0,
      net_after_refunds_pence: 2000,
      average_sale_pence: 2000,
      retail_per_visit_pence: 2000,
    },
    by_period: [],
    by_reporting_group: [],
    by_line_type: [],
    by_service: [],
    by_category: [],
    by_performer: [],
    by_seller: [],
    discounts_by_reason: [],
    discounts_by_person: [],
    products: {
      totals: productFigures,
      by_product: [{ ...productFigures, key: 'p1', product_id: 'p1', name: 'Bond oil', brand_name: null }],
      by_brand: [],
      by_category: [],
      // Stock is counted: the stock card shows.
      stock: { value_cost_pence: 4000, value_retail_pence: 9000, units: 5, tracked: 1, dead_count: 0, dead: [], sell_through_count: 0, sell_through: [] },
    },
    ...over,
  };
}

const person = {
  person_key: 'c:cal-1',
  calendar_id: 'cal-1',
  staff_id: null,
  person_name: 'Hannah',
  service_base_pence: 10000,
  service_commission_pence: 1000,
  product_base_pence: 0,
  product_commission_pence: 0,
  voucher_base_pence: 0,
  voucher_commission_pence: 0,
  total_commission_pence: 1000,
  tips_pence: 0,
  sales_pence: 10000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSalesArgs.length = 0;
  mockCommissionArgs.length = 0;
  mockLinesArgs.length = 0;
  mockSales = sales({ calendar: HANNAH });
  const { person_key: _k, calendar_id: _c, staff_id: _s, person_name: _n, ...totals } = person;
  mockCommission = {
    from: '2026-10-01',
    to: '2026-10-09',
    rows: [person],
    totals,
    lines: null,
    changed: null,
    has_rates: true,
    currency: 'GBP',
    receipt_prefix: 'R-',
    can_export: true,
    calendar: HANNAH,
  };
});

describe('Sales with a calendar chosen', () => {
  it("asks for that calendar's sales and its CSVs, and says so", async () => {
    await render(withCalendar(<SalesSection canExport today="2026-10-09" />));
    expect(mockSalesArgs[0]).toEqual([{ kind: 'preset', preset: 'this-week' }, 'day', { calendarId: 'cal-1', reportsVisible: true }]);
    expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Sales as CSV'));
    });
    expect(mockDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/api/venue/reports/sales?grain=day&preset=this-week&calendar_id=cal-1&format=csv&card=totals' }),
    );
  });

  it('says the stock card is the whole venue', async () => {
    await render(withCalendar(<SalesSection canExport today="2026-10-09" />));
    expect(screen.getByText('Stock value, slow sellers and sell-through')).toBeTruthy();
    expect(screen.getAllByText('These figures are for the whole venue.')).toHaveLength(1);
  });

  it('says nothing about calendars with all calendars chosen', async () => {
    mockSales = sales();
    await render(withCalendar(<SalesSection canExport today="2026-10-09" />, null));
    expect(mockSalesArgs[0]).toEqual([{ kind: 'preset', preset: 'this-week' }, 'day', { calendarId: null, reportsVisible: true }]);
    expect(screen.queryByText(/^Showing/)).toBeNull();
    expect(screen.queryByText('These figures are for the whole venue.')).toBeNull();
  });
});

describe('Commission with a calendar chosen', () => {
  it("asks for that calendar's commission, lines and CSVs included", async () => {
    await render(withCalendar(<CommissionSection today="2026-10-09" />));
    expect(mockCommissionArgs[0]).toEqual([{ kind: 'preset', preset: 'this-month' }, 'day', { calendarId: 'cal-1' }]);
    expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: "Hannah's sales" }));
    });
    expect(mockLinesArgs[mockLinesArgs.length - 1]).toEqual([{ kind: 'preset', preset: 'this-month' }, 'day', 'c:cal-1', 'cal-1']);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Export Commission by person as CSV'));
    });
    expect(mockDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: '/api/venue/pos/commission/report?grain=day&preset=this-month&calendar_id=cal-1&format=csv&kind=summary',
      }),
    );
  });
});
