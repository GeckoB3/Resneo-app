/**
 * Reports, Commission splits (web Reports tab, 2026-10-14), with Checkout on or off:
 *
 * - Your team: one row per person with each person's label and the totals row, the no-rates note
 *   with its way to Commission splits, "Changed since you exported it", the note when services count
 *   from completed bookings and the VAT note, a person's lines (a sale links to its sale; a completed
 *   booking shows its date, time, client and service), and the summary and lines CSVs, after which
 *   the report is read again.
 * - Businesses you work with: You owe and Owed to you, by business, a row per split, a split's
 *   lines, its statements, Manage splits, the VAT note, the CSVs, and nothing for these dates.
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
const mockBizRefetch = jest.fn();
let mockReport: Record<string, unknown>;
let mockBiz: Record<string, unknown>;
let mockTeamLines: Record<string, unknown>[];
const mockLinesFor: (string | null)[] = [];
const mockSplitLinesFor: (string | null)[] = [];
jest.mock('@/lib/queries/useCommissionSplits', () => ({
  useTeamCommissionReport: () => ({ data: mockReport, isLoading: false, isFetching: false, isError: false, refetch: mockRefetch }),
  useTeamCommissionLines: (_c: unknown, person: string | null) => {
    mockLinesFor.push(person);
    return { data: person ? { lines: mockTeamLines } : undefined, isError: false, refetch: jest.fn() };
  },
  useSplitsReport: () => ({ data: mockBiz, isLoading: false, isFetching: false, isError: false, refetch: mockBizRefetch }),
  useSplitLines: (_c: unknown, splitId: string | null) => {
    mockSplitLinesFor.push(splitId);
    return {
      data: splitId
        ? {
            lines: [
              { kind: 'booking', date: '2026-10-03', time: '10:30:00', item_type: 'service', item_name: 'Cut and finish', sale_number: null, base_pence: 4500, rate_bps: 4000, owed_pence: 1800 },
              { kind: 'sale', date: '2026-10-04', time: null, item_type: 'product', item_name: 'Bond oil', sale_number: 12, base_pence: 2000, rate_bps: 1000, owed_pence: 200 },
              { kind: 'refund', date: '2026-10-05', time: null, item_type: 'product', item_name: 'Bond oil', sale_number: 12, base_pence: -2000, rate_bps: 1000, owed_pence: -200 },
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
  label: 'their_share',
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

const saleLine = {
  row_kind: 'refund',
  business_date: '2026-10-03',
  sale_id: 'sale-9',
  sale_number: 42,
  refund_id: 'r1',
  line_id: 'l1',
  booking_id: null,
  booking_time: null,
  client_name: null,
  item_type: 'product',
  item_name: 'Bond oil',
  person_key: 'c:cal-1',
  calendar_id: 'cal-1',
  staff_id: null,
  person_name: 'Sam',
  share_bps: 5000,
  base_pence: -2000,
  rate_bps: 1000,
  commission_pence: -200,
  sales_pence: -2000,
};

const bookingLine = {
  ...saleLine,
  row_kind: 'booking',
  business_date: '2026-10-06',
  sale_id: null,
  sale_number: null,
  refund_id: null,
  line_id: null,
  booking_id: 'b-1',
  booking_time: '14:15:00',
  client_name: 'Jane Smith',
  item_type: 'service',
  item_name: 'Colour',
  share_bps: 10000,
  base_pence: 6000,
  commission_pence: 600,
  sales_pence: 6000,
};

const splitRow = {
  split_id: 's-1',
  label: 'rent',
  role: 'payee',
  status: 'active',
  payer: { venue_id: 'v-sam', name: 'Sam Cuts' },
  payee: { venue_id: 'v-bloom', name: 'Bloom' },
  partner: { venue_id: 'v-sam', name: 'Sam Cuts' },
  calendar: { id: 'cal-sam', name: 'Sam' },
  services_pence: 90000,
  services_owed_pence: 36000,
  products_pence: 0,
  products_owed_pence: 0,
  owed_pence: 36000,
  kept_pence: 54000,
  rates: [{ effective_from: '2026-10-01', services_rate_bps: 4000, products_rate_bps: null }],
  vat_basis: 'net_ex_vat',
  vat_note: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLinesFor.length = 0;
  mockSplitLinesFor.length = 0;
  mockTeamLines = [saleLine, bookingLine];
  const { person_key: _k, calendar_id: _c, staff_id: _s, person_name: _n, label: _l, ...totals } = person;
  mockReport = {
    from: '2026-10-01',
    to: '2026-10-09',
    preset: 'this-month',
    today: '2026-10-09',
    calendar: null,
    source: 'checkout',
    basis: 'net_ex_vat',
    vat_note: false,
    rows: [person],
    totals,
    lines: null,
    changed: { exported_at: '2026-10-05T09:00:00Z', persons: ['c:cal-1'], lines: ['l1'] },
    has_rates: false,
    currency: 'GBP',
    receipt_prefix: 'R-',
    can_export: true,
  };
  mockBiz = {
    from: '2026-10-01',
    to: '2026-10-09',
    preset: 'this-month',
    today: '2026-10-09',
    currency: 'GBP',
    rows: [splitRow],
    totals: { you_owe_pence: 0, owed_to_you_pence: 36000 },
    by_business: [{ venue_id: 'v-sam', name: 'Sam Cuts', you_owe_pence: 0, owed_to_you_pence: 36000 }],
    lines: null,
    can_export: true,
  };
});

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

describe('your team', () => {
  it('shows each person with their label and the totals, the no-rates note and what changed since the export', async () => {
    await render(<CommissionSection today="2026-10-09" />);
    // One range for both halves.
    expect(screen.getAllByLabelText(/^This month, /)).toHaveLength(1);
    expect(screen.getAllByText('Your team').length).toBeGreaterThan(0);
    expect(screen.getByText("You haven't set any commission rates yet.")).toBeTruthy();
    expect(screen.getByText('Commission by person')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('Their share')).toBeTruthy();
    expect(screen.getByText('Changed since you exported it on 5 October 2026')).toBeTruthy();
    expect(screen.getByText(/Only sales checked out in Checkout count/)).toBeTruthy();
    expect(screen.getAllByText('Tips (for reference)').length).toBeGreaterThan(0);
    await press(screen.getByText('Commission splits'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits');
  });

  it('says when services count from completed bookings, and when prices are as booked', async () => {
    mockReport = { ...mockReport, source: 'bookings', vat_note: true, has_rates: true };
    await render(<CommissionSection today="2026-10-09" />);
    expect(
      screen.getByText('Services count from completed bookings at their booked price. Products and gift vouchers count from Checkout.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Only sales checked out in Checkout count/)).toBeNull();
    expect(screen.getByText("VAT isn't set up in ResNeo, so figures use prices as booked.")).toBeTruthy();
    expect(screen.queryByText("You haven't set any commission rates yet.")).toBeNull();
  });

  it("opens a person's lines: a sale links to its sale, a booking shows its date, time, client and service", async () => {
    await render(<CommissionSection today="2026-10-09" />);
    await press(screen.getByLabelText("Sam's sales"));
    expect(mockLinesFor).toContain('c:cal-1');
    expect(screen.getByText('Refund on Sale R-42')).toBeTruthy();
    expect(screen.getByText('Credit changed after the export')).toBeTruthy();
    expect(screen.getByText('6 October 2026, 14:15')).toBeTruthy();
    expect(screen.getByText('Booking, Jane Smith')).toBeTruthy();
    expect(screen.getByText('Colour')).toBeTruthy();
    expect(screen.getAllByText('Sale or booking').length).toBe(2);
    await press(screen.getByText('Refund on Sale R-42'));
    expect(mockPush).toHaveBeenCalledWith('/checkout/sale-9');
  });

  it('exports the summary and every line, then reads the report again', async () => {
    await render(<CommissionSection today="2026-10-09" />);
    await press(screen.getByLabelText('Export Commission by person as CSV'));
    expect(mockDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/api/venue/commission/report?preset=this-month&format=csv&kind=summary' }),
    );
    expect(mockRefetch).toHaveBeenCalled();
    await press(screen.getByText("Export CSV: Everyone's sales"));
    expect(mockDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/api/venue/commission/report?preset=this-month&format=csv&kind=lines' }),
    );
  });

  it('offers no export without the export permission', async () => {
    mockReport = { ...mockReport, can_export: false };
    mockBiz = { ...mockBiz, can_export: false };
    await render(<CommissionSection today="2026-10-09" />);
    expect(screen.queryByText('Export CSV')).toBeNull();
    expect(screen.queryByText("Export CSV: Everyone's sales")).toBeNull();
  });
});

describe('businesses you work with', () => {
  it('shows what you owe and are owed, a row per split, and the VAT note', async () => {
    await render(<CommissionSection today="2026-10-09" />);
    expect(screen.getByText('You owe')).toBeTruthy();
    expect(screen.getByText('Owed to you')).toBeTruthy();
    expect(screen.getAllByText('£360.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Sam at Sam Cuts')).toBeTruthy();
    expect(screen.getByText('Sam Cuts pays you')).toBeTruthy();
    expect(screen.getByText('40% of services')).toBeTruthy();
    expect(screen.getByText('£540.00')).toBeTruthy();
    expect(screen.getByText("VAT isn't set up in ResNeo for Sam Cuts, so its figures use prices as booked.")).toBeTruthy();
    // One business: no table by business.
    expect(screen.queryByText('Business')).toBeNull();
  });

  it("opens a split's lines, its statements and Manage splits", async () => {
    await render(<CommissionSection today="2026-10-09" />);
    await press(screen.getByLabelText('Sam at Sam Cuts'));
    expect(mockSplitLinesFor).toContain('s-1');
    expect(screen.getByText('3 October 2026, 10:30')).toBeTruthy();
    expect(screen.getByText('Booking')).toBeTruthy();
    expect(screen.getByText('Sale 12')).toBeTruthy();
    expect(screen.getByText('Refund on Sale 12')).toBeTruthy();
    await press(screen.getByText('Export CSV: Sam at Sam Cuts'));
    expect(mockDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/api/venue/commission/splits/report?preset=this-month&split=s-1&format=csv&kind=lines' }),
    );
    await press(screen.getByText('Statements'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits/s-1');
    await press(screen.getByText('Manage splits'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits?section=businesses');
  });

  it('exports the summary, and says when there is nothing for these dates', async () => {
    await render(<CommissionSection today="2026-10-09" />);
    await press(screen.getByLabelText('Export Businesses you work with as CSV'));
    expect(mockDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/api/venue/commission/splits/report?preset=this-month&format=csv&kind=summary' }),
    );
    expect(mockBizRefetch).toHaveBeenCalled();
  });

  it('says there are no business splits for these dates', async () => {
    mockBiz = { ...mockBiz, rows: [], by_business: [], totals: { you_owe_pence: 0, owed_to_you_pence: 0 } };
    await render(<CommissionSection today="2026-10-09" />);
    expect(screen.getByText('No business splits for these dates.')).toBeTruthy();
  });
});

describe('finding your way around', () => {
  it('links to the rates, hides gift vouchers with none in the range, and says the names open their lines', async () => {
    await render(<CommissionSection today="2026-10-09" />);
    expect(screen.queryByText('Vouchers sold')).toBeNull();
    expect(screen.queryByText('Vouchers commission')).toBeNull();
    expect(
      screen.getByText("Choose a name to see what it is worked out from. Tips aren't commission. They're here so you can see everything in one place."),
    ).toBeTruthy();
    expect(screen.getByText('Choose a split to see what it is worked out from.')).toBeTruthy();
    expect(screen.getByText('Payer keeps')).toBeTruthy();
    await press(screen.getByText('Change rates'));
    expect(mockPush).toHaveBeenCalledWith('/commission-splits');
  });

  it('shows gift voucher columns once vouchers counted something', async () => {
    mockReport = { ...mockReport, totals: { ...(mockReport.totals as object), voucher_base_pence: 5000 } };
    await render(<CommissionSection today="2026-10-09" />);
    expect(screen.getAllByText('Vouchers sold').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vouchers commission').length).toBeGreaterThan(0);
  });

  it("names a person's line columns plainly, with Their part for a shared line, and closes the lines", async () => {
    await render(<CommissionSection today="2026-10-09" />);
    await press(screen.getByLabelText("Sam's sales"));
    for (const label of ['Item', 'Their part', 'Counted', 'Rate']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.queryByText('Base')).toBeNull();
    await press(screen.getByText('Close'));
    expect(screen.queryByText('Their part')).toBeNull();
  });

  it("closes a split's lines", async () => {
    await render(<CommissionSection today="2026-10-09" />);
    await press(screen.getByLabelText('Sam at Sam Cuts'));
    expect(screen.getByText('Export CSV: Sam at Sam Cuts')).toBeTruthy();
    await press(screen.getByText('Close'));
    expect(screen.queryByText('Export CSV: Sam at Sam Cuts')).toBeNull();
  });
});
