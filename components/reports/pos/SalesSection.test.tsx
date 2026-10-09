/**
 * The Sales tab against the web's SalesSection and SalesProductSections: the totals with discounts,
 * deposits applied and VAT, the kind-of-item table only when there is more than one kind, the
 * product cards once a product was sold or stock is counted, and the per-card CSVs.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useSalesRange: () => ({ data: mockSales, isLoading: false, isFetching: false, isError: false, refetch: jest.fn() }),
}));

import { SalesSection } from '@/components/reports/pos/SalesSection';

const amounts = { quantity: 2, gross_pence: 5000, discount_pence: 500, sales_pence: 4500, tax_pence: 750, refunds_pence: 0 };
const productFigures = {
  quantity: 3,
  discount_pence: 0,
  sales_pence: 6000,
  tax_pence: 1000,
  refunds_pence: 0,
  revenue_ex_vat_pence: 5000,
  costed_revenue_ex_vat_pence: 5000,
  cost_of_goods_pence: 2000,
  margin_pence: 3000,
  margin_bps: 6000,
  units_restocked: 0,
  lines_without_cost: 1,
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
      sales_count: 3,
      visit_count: 1,
      gross_pence: 10500,
      discount_pence: 500,
      sales_pence: 10000,
      tax_pence: 1667,
      services_pence: 4000,
      retail_pence: 6000,
      applied_pence: 2000,
      refunds_pence: 1000,
      refund_count: 1,
      net_after_refunds_pence: 9000,
      average_sale_pence: 3333,
      retail_per_visit_pence: 6000,
    },
    by_period: [{ period_start: '2026-10-05', period_end: '2026-10-05', sales_count: 3, sales_pence: 10000, discount_pence: 500, refunds_pence: 1000 }],
    by_reporting_group: [{ ...amounts, key: 'services' }],
    by_line_type: [{ ...amounts, key: 'service' }],
    by_service: [{ ...amounts, key: 'svc1', service_item_id: 'i1', name: 'Cut and finish', line_type: 'service' }],
    by_category: [{ category_id: null, name: null, quantity: 2, sales_pence: 4000, tax_pence: 0, refunds_pence: 0 }],
    by_performer: [{ calendar_id: 'c1', staff_id: null, name: 'Sam', services_pence: 4000, retail_pence: 0, other_pence: 0, total_pence: 4000, refunds_pence: 0 }],
    by_seller: [],
    discounts_by_reason: [{ reason: '', discount_count: 1, amount_pence: 500 }],
    discounts_by_person: [{ staff_id: 's1', name: 'Sam', discount_count: 1, amount_pence: 500 }],
    products: {
      totals: productFigures,
      by_product: [{ ...productFigures, key: 'p1', product_id: 'p1', name: 'Bond oil', brand_name: 'Olaplex' }],
      by_brand: [],
      by_category: [],
      stock: { value_cost_pence: 0, value_retail_pence: 0, units: 0, tracked: 0, dead_count: 0, dead: [], sell_through_count: 0, sell_through: [] },
    },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSales = sales();
});

it('shows the totals, the services and products cards and the product cards', async () => {
  await render(<SalesSection canExport today="2026-10-09" />);
  expect(screen.getByText('Sales, 5 Oct to 11 Oct 2026')).toBeTruthy();
  expect(screen.getByText('Refunds -£10')).toBeTruthy();
  expect(screen.getByText('1 visit with a service')).toBeTruthy();
  expect(screen.getByText('Deposits and earlier payments applied')).toBeTruthy();
  expect(screen.getByText('VAT included')).toBeTruthy();
  expect(screen.getByText('Cut and finish')).toBeTruthy();
  expect(screen.getByText('No category')).toBeTruthy();
  expect(screen.getByText('No reason given')).toBeTruthy();
  // Only one kind of item: no kind table.
  expect(screen.queryByText('Kind')).toBeNull();
  expect(screen.getByText('Margin and cost of products')).toBeTruthy();
  expect(screen.getByText("1 product sold had no cost price, so it's left out of the margin. Add cost prices in Products.")).toBeTruthy();
  expect(screen.getByText('Bond oil')).toBeTruthy();
  // No stock is counted: no stock card.
  expect(screen.queryByText('Stock value, slow sellers and sell-through')).toBeNull();
});

it('downloads a product card from the server', async () => {
  await render(<SalesSection canExport today="2026-10-09" />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export By product as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/reports/sales?grain=day&preset=this-week&format=csv&card=by_product' }),
  );
});

it('leaves the product cards out until a product is sold or stock is counted', async () => {
  mockSales = sales({ products: undefined });
  await render(<SalesSection canExport={false} today="2026-10-09" />);
  expect(screen.queryByText('Margin and cost of products')).toBeNull();
  expect(screen.queryByText('Export CSV')).toBeNull();
});
