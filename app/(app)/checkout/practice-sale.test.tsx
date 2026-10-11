/**
 * The sale screen's one hook for the practice sale (POS test round 2026-10-11, Part 4, OB4): only a
 * sale the server marks `practice: true` opens the practice screen. Every other sale, including one
 * from a server that sends no flag, keeps the ordinary screen exactly as before, and so does Sales
 * history while Checkout is off.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import SaleScreen from './[id]';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
const mockTitles: (string | undefined)[] = [];
jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options?: { title?: string } }) => {
      mockTitles.push(options?.title);
      return null;
    },
  },
  useLocalSearchParams: () => ({ id: 'sale-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { id: 'staff-1', role: 'admin', linked_calendar_ids: [] } } }),
}));
jest.mock('@/lib/payments/terminal-sdk', () => ({
  ...jest.requireActual<typeof import('@/lib/payments/terminal-sdk')>('@/lib/payments/terminal-sdk'),
  isTerminalSdkAvailable: () => false,
}));
const mockPaySheetSales: unknown[] = [];
jest.mock('@/components/pos/PaySheet', () => ({
  PaySheet: ({ sale }: { sale: unknown }) => {
    mockPaySheetSales.push(sale);
    return null;
  },
}));
jest.mock('@/components/pos/practice/PracticeSale', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { PracticeSale: ({ sale }: { sale: { id: string } }) => React.createElement(Text, null, `practice-screen ${sale.id}`) };
});
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
jest.mock('@/components/pos/AfterSaleSheets', () => ({ RefundSheet: () => null, ReceiptSheet: () => null, TipSplitSheet: () => null }));
jest.mock('@/components/pos/useOpenCheckout', () => ({
  saleHref: (id: string) => `/checkout/${id}`,
  useOpenCheckout: () => ({ open: jest.fn(), openingKey: null }),
}));

let mockPosOn = true;
let mockSale: unknown = null;
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosEnabled: () => mockPosOn,
  usePosBootstrap: () => ({
    data: {
      settings: { max_payment_pence: 1_000_000 },
      capabilities: { take_payment: true, create_sale: true, park_sale: true, void_open_sale: true, apply_discount: true },
      role: 'admin',
      tills: [],
      payment_types: [],
      discount_presets: [],
      operators: [],
      venue: { name: 'Bloom', currency: 'GBP', timezone: 'Europe/London' },
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  usePosSale: () => ({ data: mockSale, isLoading: false, isRefetching: false, error: null, refetch: jest.fn() }),
  useSaleWrite: () => ({ mutateAsync: jest.fn() }),
}));

import { makeSale } from '@/lib/pos/test-sale';

const on = {
  id: 'venue-1',
  name: 'Bloom',
  currency: 'GBP',
  timezone: 'Europe/London',
  feature_flags: { raw: { pos_enabled: true }, resolved: { pos_enabled: true } },
};
const switchedOff = { ...on, feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } } };

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <SaleScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockTitles.length = 0;
  mockPaySheetSales.length = 0;
  mockPosOn = true;
  mockVenue = on;
});

describe('the sale screen and practice sales', () => {
  it('keeps every ordinary sale on the ordinary screen, as before', async () => {
    for (const sale of [makeSale(), { ...makeSale(), practice: false }, { ...makeSale(), practice: null }]) {
      mockSale = sale;
      mockTitles.length = 0;
      mockPaySheetSales.length = 0;
      await show();
      expect(screen.queryByText(/practice-screen/)).toBeNull();
      expect(mockTitles).toContain('Sale R-12');
      expect(screen.getAllByText('Take £40.00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Park sale').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Void sale').length).toBeGreaterThan(0);
      // The ordinary pay sheet is there, for the same sale.
      expect(mockPaySheetSales.at(-1)).toBe(sale);
      await screen.unmount();
    }
  });

  it('opens the practice screen only for a sale the server marks practice', async () => {
    mockSale = { ...makeSale(), practice: true };
    await show();
    expect(screen.getByText('practice-screen sale-1')).toBeTruthy();
    expect(screen.queryByText('Park sale')).toBeNull();
    expect(screen.queryByText('Take £40.00')).toBeNull();
    expect(mockPaySheetSales).toHaveLength(0);
  });

  it('leaves Sales history as it is while Checkout is off', async () => {
    mockPosOn = false;
    mockVenue = switchedOff;
    mockSale = { ...makeSale({ status: 'voided', voided_at: '2026-10-11T12:00:00Z', void_reason: 'Practice' }), practice: true };
    await show();
    expect(screen.queryByText(/practice-screen/)).toBeNull();
    expect(screen.getByText('Checkout is switched off for Bloom. You can still see past sales and give refunds.')).toBeTruthy();
  });
});
