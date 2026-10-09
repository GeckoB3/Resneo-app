/**
 * The Vouchers tab against the web's VouchersSection and AllVouchersCard: its own range (this
 * month by default) and "still to be spent" date, the five figures, vouchers added from before
 * ResNeo, account credit, the list with search and status, and the CSV from the server.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) => (visible ? React.createElement(View, null, children) : null),
  };
});
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
jest.mock('@/lib/queries/useGuests', () => ({ useGuests: () => ({ data: undefined }) }));
jest.mock('@/lib/pos/voucher-math', () => ({
  ...jest.requireActual<typeof import('@/lib/pos/voucher-math')>('@/lib/pos/voucher-math'),
  todayInZone: () => '2026-10-09',
}));
const mockDownload = jest.fn(async (_args: { path: string }) => ({ ok: true as const, filename: 'x.csv' }));
jest.mock('@/lib/reports/pos-report-download', () => ({
  downloadReportFile: (args: { path: string }) => mockDownload(args),
}));
const mockReportArgs: unknown[][] = [];
const mockListArgs: { asAt: string; limit: number; q?: string | null; status?: string | null }[] = [];
jest.mock('@/lib/queries/usePosReports', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePosReports')>('@/lib/queries/usePosReports'),
  useVoucherReport: (period: { from: string; to: string }, asAt: string) => {
    mockReportArgs.push([period, asAt]);
    return {
      data: {
        currency: 'GBP',
        report: {
          from: period.from,
          to: period.to,
          as_at: asAt,
          vouchers: {
            sold_pence: 10000,
            sold_count: 2,
            redeemed_pence: 3000,
            reversed_pence: '500',
            expired_pence: 0,
            refunded_pence: 0,
            outstanding_as_at_pence: 6500,
            existing_count: 1,
            existing_pence: 2600,
          },
          credit: { refunded_in_pence: 1000, added_pence: 500, used_pence: 200, reversed_pence: 0, outstanding_as_at_pence: 1300 },
        },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: jest.fn(),
    };
  },
  useVoucherList: (params: { asAt: string; limit: number; q?: string | null; status?: string | null }) => {
    mockListArgs.push(params);
    return {
      data: {
        vouchers: [
          {
            id: 'v1',
            code_last4: '9HPA',
            source: 'sold',
            status: 'active',
            initial_pence: 5000,
            balance_pence: 2000,
            issued_at: '2026-10-02T10:00:00Z',
            expires_at: null,
            buyer_name: 'Alex',
            recipient_name: 'Jo',
          },
        ],
        total: 30,
        offset: 0,
        limit: params.limit,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  },
  useVoucherDetail: () => ({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() }),
  useVoucherAction: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddExistingVoucher: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVoucherImport: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { VouchersSection } from '@/components/reports/vouchers/VouchersSection';

beforeEach(() => {
  jest.clearAllMocks();
  mockReportArgs.length = 0;
  mockListArgs.length = 0;
});

it('opens on this month, as at its last day, with the five figures', async () => {
  await render(<VouchersSection canExport timeZone="Europe/London" currency="GBP" />);
  expect(mockReportArgs[0]).toEqual([{ from: '2026-10-01', to: '2026-10-09' }, '2026-10-09']);
  expect(screen.getByText('Vouchers, 1 October 2026 to 9 October 2026')).toBeTruthy();
  expect(screen.getByText('2 vouchers')).toBeTruthy();
  // Used is what was redeemed less what was put back (strings from SQL included).
  expect(screen.getByText('£25')).toBeTruthy();
  expect(screen.getByText('Expired unused')).toBeTruthy();
  expect(screen.getAllByText('On 9 October 2026').length).toBe(2);
  expect(screen.getByText('Added from before ResNeo')).toBeTruthy();
  expect(screen.getByText('Given')).toBeTruthy();
  expect(screen.getByText('£15')).toBeTruthy();
});

it('moves the period and the as-at date as the web does', async () => {
  await render(<VouchersSection canExport timeZone="Europe/London" currency="GBP" />);
  await act(async () => {
    fireEvent.press(screen.getByText('Last month'));
  });
  expect(mockReportArgs[mockReportArgs.length - 1]).toEqual([{ from: '2026-09-01', to: '2026-09-30' }, '2026-09-30']);
  mockDates['Still to be spent'] = '2026-12-31';
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Still to be spent'));
  });
  expect(mockReportArgs[mockReportArgs.length - 1]).toEqual([{ from: '2026-09-01', to: '2026-09-30' }, '2026-12-31']);
  expect(mockListArgs[mockListArgs.length - 1]).toEqual(expect.objectContaining({ asAt: '2026-12-31', limit: 25 }));
});

it('downloads the voucher CSV with the period and the as-at date', async () => {
  await render(<VouchersSection canExport timeZone="Europe/London" currency="GBP" />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Export Vouchers, 1 October 2026 to 9 October 2026 as CSV'));
  });
  expect(mockDownload).toHaveBeenLastCalledWith(
    expect.objectContaining({ path: '/api/venue/pos/vouchers/report?from=2026-10-01&to=2026-10-09&as_at=2026-10-09&format=csv' }),
  );
});

it('lists every voucher, filters by status and pages 25 at a time', async () => {
  await render(<VouchersSection canExport={false} timeZone="Europe/London" currency="GBP" />);
  expect(screen.queryByText('Export CSV')).toBeNull();
  expect(screen.getByText('Voucher ending 9HPA')).toBeTruthy();
  expect(screen.getByText('For Jo · Bought by Alex · Issued 2 October 2026')).toBeTruthy();
  expect(screen.getByText('£20 of £50')).toBeTruthy();
  expect(screen.getByText('Showing 1 of 30')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Used up'));
  });
  expect(mockListArgs[mockListArgs.length - 1]).toEqual(expect.objectContaining({ status: 'used_up', limit: 25 }));
  await act(async () => {
    fireEvent.press(screen.getByText('Show more'));
  });
  expect(mockListArgs[mockListArgs.length - 1]).toEqual(expect.objectContaining({ limit: 50 }));
});

it('opens adding an existing voucher and importing a file', async () => {
  await render(<VouchersSection canExport timeZone="Europe/London" currency="GBP" />);
  await act(async () => {
    fireEvent.press(screen.getByText('Add an existing voucher'));
  });
  expect(screen.getByText('Use the code printed on the voucher')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getAllByText('Cancel')[0]!);
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Import vouchers from a file'));
  });
  expect(screen.getByText('Import gift vouchers')).toBeTruthy();
  expect(screen.getByText('Download a template')).toBeTruthy();
});
