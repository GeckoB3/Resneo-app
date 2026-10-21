/**
 * The sale screen while a card payment waits on a team member's phone (sent from this device or the
 * web till): a login that takes payments follows it with the Send to a phone panel (who has it, the
 * time left, Cancel), so a sheet closed while it waits still shows where it is; any other login sees
 * that a card payment is in progress.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SaleScreen from './[id]';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'sale-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
const mockVenue = {
  id: 'venue-1',
  name: 'Bloom',
  currency: 'GBP',
  timezone: 'Europe/London',
  feature_flags: { raw: { pos_enabled: true }, resolved: { pos_enabled: true } },
};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, terminology: { client: 'client', booking: 'appointment', staff: 'staff' } }),
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: 'staff', linked_calendar_ids: [] } } }),
}));
jest.mock('@/lib/payments/terminal-sdk', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>('@/lib/payments/terminal-sdk'),
  isTerminalSdkAvailable: () => false,
}));
jest.mock('@/components/pos/PaySheet', () => ({ PaySheet: () => null }));
jest.mock('@/components/pos/ReaderPayPanel', () => ({ ReaderPayPanel: () => null }));
jest.mock('@/components/pos/SendToPhonePanel', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SendToPhonePanel: ({ pendingPaymentId, amountPence }: { pendingPaymentId: string; amountPence: number }) =>
      React.createElement(Text, null, `phone-panel ${pendingPaymentId} ${amountPence}`),
  };
});
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
jest.mock('@/components/pos/AfterSaleSheets', () => ({ RefundSheet: () => null, ReceiptSheet: () => null, TipSplitSheet: () => null }));
jest.mock('@/components/pos/useOpenCheckout', () => ({
  saleHref: (id: string) => `/checkout/${id}`,
  useOpenCheckout: () => ({ open: jest.fn(), openingKey: null }),
}));

let mockCapabilities: Record<string, boolean> = {};
let mockSale: unknown = null;
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosEnabled: () => true,
  usePosBootstrap: () => ({
    data: {
      settings: { max_payment_pence: 1_000_000 },
      capabilities: mockCapabilities,
      role: 'staff',
      tills: [],
      payment_types: [],
      discount_presets: [],
      operators: [],
      card_methods: { card_app: true, send_to_phone: true },
      venue: { name: 'Bloom', currency: 'GBP', timezone: 'Europe/London' },
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  usePosSale: () => ({ data: mockSale, isLoading: false, isRefetching: false, error: null, refetch: jest.fn() }),
  useSaleWrite: () => ({ mutateAsync: jest.fn() }),
}));

import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <SaleScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSale = makeSale({
    total_pence: 4500,
    balance_due_pence: 4500,
    lines: [makeLine({ total_pence: 4500 })],
    payment_lock_payment_id: 'pay-7',
    payments: [makePayment({ id: 'pay-7', method: 'card_app', status: 'pending', collect_state: 'awaiting_device', amount_pence: 4500 })],
  });
});

describe("a sale waiting on a team member's phone", () => {
  it('follows it with the Send to a phone panel for a login that takes payments', async () => {
    mockCapabilities = { take_payment: true };
    await show();
    expect(screen.getByText('phone-panel pay-7 4500')).toBeTruthy();
    expect(screen.queryByText('A card payment is in progress on this sale.')).toBeNull();
  });

  it('says a card payment is in progress to any other login, with nothing to press', async () => {
    mockCapabilities = {};
    await show();
    expect(screen.getByText('A card payment is in progress on this sale.')).toBeTruthy();
    expect(screen.queryByText(/phone-panel/)).toBeNull();
    expect(screen.queryByText('Cancel the card payment')).toBeNull();
  });
});
