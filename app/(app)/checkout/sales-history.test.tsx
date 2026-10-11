/**
 * Sales history after Checkout goes off (POS Part 5, design section 7.2; the web's `hist.*`): at a
 * venue that has had Checkout, an admin keeps the list of sales, read only, and each past sale
 * opens read only with refunds (as the web's `readOnlyHistory`). Team members, and venues that
 * never had Checkout, keep today's "Checkout isn't switched on" and ask nothing.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AllSalesScreen from './all-sales';
import SaleScreen from './[id]';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
const mockTitles: (string | undefined)[] = [];
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options?: { title?: string } }) => {
      mockTitles.push(options?.title);
      return null;
    },
  },
  useLocalSearchParams: () => ({ id: 'sale-1' }),
  useRouter: () => mockRouter,
}));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
let mockVenue: Record<string, unknown> | null = null;
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockRole: 'admin' | 'staff' = 'admin';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: mockRole, linked_calendar_ids: [] } } }),
}));
jest.mock('@/lib/payments/terminal-sdk', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>('@/lib/payments/terminal-sdk'),
  isTerminalSdkAvailable: () => false,
}));
// The sale's own sheets have their own tests; here they only need to be there.
jest.mock('@/components/pos/PaySheet', () => ({ PaySheet: () => null }));
jest.mock('@/components/pos/ReaderPayPanel', () => ({ ReaderPayPanel: () => null }));
jest.mock('@/components/pos/SavedCards', () => ({ SavedCardDeclinedNotice: () => null }));
jest.mock('@/components/pos/PayLinkExtras', () => ({ OpenPayLinks: () => null, TipLinkSheet: () => null }));
jest.mock('@/components/pos/LoyaltyReward', () => ({ RewardReadyChip: () => null }));
jest.mock('@/components/pos/VoucherSheets', () => ({ IssuedVouchers: () => null, VoucherLineSheet: () => null, voucherLineDetails: () => [] }));
jest.mock('@/components/pos/SaleSheets', () => ({
  AddItemsSheet: () => null,
  ClientSheet: () => null,
  CombineSheet: () => null,
  DiscountSheet: () => null,
  LineEditorSheet: () => null,
  ParkSheet: () => null,
  ServingSheet: () => null,
  VoidSheet: () => null,
  writeError: () => 'error',
}));
jest.mock('@/components/pos/AfterSaleSheets', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RefundSheet: ({ visible, bootstrap }: { visible: boolean; bootstrap: { role?: string; capabilities: Record<string, boolean> } }) =>
      visible ? React.createElement(Text, null, `Refund sheet for ${bootstrap.role} with ${Object.keys(bootstrap.capabilities).join(',')}`) : null,
    ReceiptSheet: () => null,
    TipSplitSheet: () => null,
  };
});
jest.mock('@/components/pos/useOpenCheckout', () => ({
  saleHref: (id: string) => `/checkout/${id}`,
  useOpenCheckout: () => ({ open: jest.fn(), openingKey: null }),
}));
jest.mock('@/components/pos/CheckoutHome', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SaleRowCard: ({ row, onPress }: { row: { number_label: string }; onPress: () => void }) =>
      React.createElement(Text, { onPress }, row.number_label),
  };
});

let mockPosOn = false;
const mockListOptions: unknown[] = [];
const mockSaleOptions: unknown[] = [];
jest.mock('@/lib/queries/usePos', () => {
  const { makePayment, makeSale } = jest.requireActual<typeof import('@/lib/pos/test-sale')>('@/lib/pos/test-sale');
  const sale = makeSale({
    status: 'part_paid',
    paid_pence: 1000,
    balance_due_pence: 3000,
    payments: [makePayment({ amount_pence: 1000, refundable_pence: 1000 })],
  });
  return {
    ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
    usePosEnabled: () => mockPosOn,
    usePosBootstrap: () => ({ data: undefined, isLoading: false, error: null, refetch: jest.fn() }),
    usePosSaleList: (_params: unknown, options: unknown) => {
      mockListOptions.push(options);
      return {
        data: { sales: [{ id: 'sale-1', number_label: 'R-12' }], next_cursor: null },
        isLoading: false,
        isError: false,
        isRefetching: false,
        refetch: jest.fn(),
      };
    },
    usePosSale: (_id: unknown, options: unknown) => {
      mockSaleOptions.push(options);
      return { data: sale, isLoading: false, isRefetching: false, error: null, refetch: jest.fn() };
    },
    useSaleWrite: () => ({ mutateAsync: jest.fn() }),
  };
});

const switchedOff = {
  id: 'venue-1',
  name: 'Bloom',
  currency: 'GBP',
  timezone: 'Europe/London',
  feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } },
};
const neverHad = { ...switchedOff, feature_flags: { raw: {}, resolved: {} } };

async function show(node: ReactNode) {
  const client = new QueryClient();
  await render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  mockTitles.length = 0;
  mockListOptions.length = 0;
  mockSaleOptions.length = 0;
  mockRouter.push.mockReset();
  mockPosOn = false;
  mockRole = 'admin';
  mockVenue = switchedOff;
});

describe('Sales history', () => {
  it('lists past sales, read only, for an admin after Checkout went off', async () => {
    await show(<AllSalesScreen />);
    expect(mockTitles).toContain('Sales history');
    expect(screen.getByText('Checkout is switched off for Bloom. You can still see past sales and give refunds.')).toBeTruthy();
    expect(mockListOptions.at(-1)).toEqual({ finishing: true });
    await act(async () => {
      fireEvent.press(screen.getByText('R-12'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/checkout/sale-1');
  });

  it("keeps today's message for a team member, and at a venue that never had Checkout", async () => {
    mockRole = 'staff';
    await show(<AllSalesScreen />);
    expect(screen.getByText("Checkout isn't switched on")).toBeTruthy();
    expect(mockListOptions.at(-1)).toEqual({ finishing: false });

    mockRole = 'admin';
    mockVenue = neverHad;
    await show(<AllSalesScreen />);
    expect(screen.getAllByText("Checkout isn't switched on").length).toBeGreaterThan(0);
    expect(mockListOptions.at(-1)).toEqual({ finishing: false });
  });

  it('is All sales as before while Checkout is on', async () => {
    mockPosOn = true;
    mockVenue = { ...switchedOff, feature_flags: { raw: { pos_enabled: true }, resolved: { pos_enabled: true } } };
    await show(<AllSalesScreen />);
    expect(mockTitles).toContain('All sales');
    expect(screen.queryByText(/Checkout is switched off/)).toBeNull();
  });

  it('opens a past sale read only, where an admin can still refund', async () => {
    await show(<SaleScreen />);
    expect(mockSaleOptions.at(-1)).toEqual({ finishing: true });
    expect(screen.getByText('Checkout is switched off for Bloom. You can still see past sales and give refunds.')).toBeTruthy();
    expect(screen.queryByText('Add items')).toBeNull();
    expect(screen.queryByText(/^Take /)).toBeNull();
    expect(screen.queryByText('Park sale')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Refund'));
    });
    expect(screen.getByText('Refund sheet for admin with refund')).toBeTruthy();
  });

  it("keeps today's message on a sale for a team member", async () => {
    mockRole = 'staff';
    await show(<SaleScreen />);
    expect(screen.getByText("Checkout isn't switched on")).toBeTruthy();
    expect(screen.queryByText('Refund')).toBeNull();
  });
});
