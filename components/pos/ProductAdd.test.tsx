/**
 * Products at the till in the app (POS app step 4, UX spec §3.8, §3.22, §21.3; test plan PRD-04):
 * adding a product from the favourites or a scan, with the stock warning and the 18+ reminder;
 * an unknown scan; a venue that does not sell beyond its count; a server before Pass 4 (no
 * products, the sheet as before); "Put back in stock" in the refund builder; and "Reward ready".
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/components/pos/SaleCardCollect', () => ({ SaleCardCollect: () => null }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: true, pos_loyalty_enabled: true } } } }),
}));

let mockCatalogue: Record<string, unknown> | null = null;
const mockLookup = jest.fn();
let mockRewards: unknown[] = [];
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosCatalogue: () => ({ data: mockCatalogue, isLoading: false, isError: false }),
  useProductSearch: () => ({ data: mockCatalogue, isLoading: false, isError: false }),
  lookupBarcode: (...args: unknown[]) => mockLookup(...args),
  lookupScannedBarcode: (...args: unknown[]) => mockLookup(...args),
  useVoucherSettings: () => ({ data: null, isLoading: false }),
  useSaleRewards: (_id: string, opts: { enabled?: boolean }) => ({ data: opts.enabled ? { rewards: mockRewards, card: null } : undefined }),
}));

import { RefundSheet } from '@/components/pos/AfterSaleSheets';
import { RewardReadyChip } from '@/components/pos/LoyaltyReward';
import { AddItemsSheet } from '@/components/pos/SaleSheets';
import { makeLine, makePayment, makeSale } from '@/lib/pos/test-sale';
import type { PosBootstrap, PosCatalogueProduct } from '@/types/pos';

function bootstrap(over: Partial<PosBootstrap> = {}): PosBootstrap {
  return {
    settings: { max_payment_pence: 1_000_000, refund_reasons: ['Product returned'] },
    capabilities: { take_payment: true, create_sale: true, refund: true },
    role: 'staff',
    tills: [],
    payment_types: [],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [],
    card_methods: { card_app: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    ...over,
  };
}

const RAZOR: PosCatalogueProduct = {
  id: 'p1',
  name: 'Straight razor',
  brand_name: null,
  restriction: 'age_18',
  options: [{ id: 'v1', name: null, sku: 'RZ', price_pence: 2400, track_stock: true, on_hand: 0, available: 0 }],
};

function catalogue(over: Record<string, unknown> = {}) {
  return {
    services: [],
    favourites: [{ id: 'f1', item_type: 'variant', item_id: 'v1', sort_order: 0 }],
    favourite_products: [RAZOR],
    products: [RAZOR],
    suggested: [],
    stock: { track_stock: true, sell_beyond_stock: true },
    ...over,
  };
}

const sale = makeSale({ operator: { calendar_id: 'cal-1', staff_id: null, name: 'Sam' } });

async function renderAdd(send = jest.fn().mockResolvedValue({ sale }), boot: PosBootstrap = bootstrap()) {
  await render(
    <AddItemsSheet visible onClose={jest.fn()} sale={sale} bootstrap={boot} send={send} myCalendarIds={[]} />,
  );
  return send;
}

beforeEach(() => {
  mockCatalogue = catalogue();
  mockLookup.mockReset();
  mockRewards = [];
});

describe('adding products', () => {
  it('adds a favourite product with who is serving, and warns about stock and age', async () => {
    const send = await renderAdd();
    await act(async () => {
      fireEvent.press(screen.getByText('Straight razor'));
    });
    expect(send).toHaveBeenCalledWith({
      action: 'lines',
      body: {
        version: sale.version,
        ops: [{ op: 'add', line: { kind: 'product', variant_id: 'v1', quantity: 1, seller: { calendar_id: 'cal-1', name: 'Sam' } } }],
      },
    });
    expect(
      screen.getByText(
        'Added Straight razor The stock count says 0 left. You can still sell it, and the count will go below zero. Check the client is 18 or over before you sell Straight razor.',
      ),
    ).toBeTruthy();
  });

  it('adds a scanned barcode from the search field (a keyboard-mode scanner ends with Enter)', async () => {
    mockLookup.mockResolvedValue({ hit: { product: RAZOR, option_id: 'v1' } });
    const send = await renderAdd();
    const field = screen.getByLabelText('Search services and products, or scan a barcode');
    await act(async () => {
      fireEvent.changeText(field, '5012345678900');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
    });
    expect(mockLookup).toHaveBeenCalledWith('token-A', '5012345678900');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('says so when no product has the scanned barcode, and adds nothing', async () => {
    mockLookup.mockResolvedValue({ unknown: true });
    const send = await renderAdd();
    const field = screen.getByLabelText('Search services and products, or scan a barcode');
    await act(async () => {
      fireEvent.changeText(field, '1234567');
    });
    await act(async () => {
      fireEvent(field, 'submitEditing');
    });
    expect(screen.getByText('No product has the barcode 1234567.')).toBeTruthy();
    expect(screen.getByText('Search instead')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses before sending when the venue doesn't sell beyond its count", async () => {
    mockCatalogue = catalogue({ stock: { track_stock: true, sell_beyond_stock: false } });
    const send = await renderAdd();
    await act(async () => {
      fireEvent.press(screen.getByText('Straight razor'));
    });
    expect(send).not.toHaveBeenCalled();
    expect(
      screen.getByText("Straight razor is out of stock, and Studio doesn't sell more than the stock count. Check the count in Stock."),
    ).toBeTruthy();
  });

  it('keeps the sheet as it was against a server before Pass 4', async () => {
    mockCatalogue = { services: [], favourites: [] };
    await renderAdd(undefined, bootstrap({ capabilities: { take_payment: true, create_sale: true, custom_line: true } }));
    expect(screen.queryByText('Products')).toBeNull();
    expect(screen.queryByText('Favourites')).toBeNull();
    expect(screen.getByText('Services')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });
});

describe('putting a refunded product back in stock (P4-10)', () => {
  it('sends restock only when ticked', async () => {
    const line = makeLine({
      id: 'line-p',
      line_type: 'product',
      variant_id: 'v1',
      name: 'Shampoo',
      quantity: 1,
      total_pence: 1800,
      product: { track_stock: true, on_hand: 3, available: 3, restriction: 'none' },
    });
    const paid = makeSale({
      status: 'completed',
      total_pence: 1800,
      balance_due_pence: 0,
      lines: [line],
      payments: [makePayment({ id: 'cash', amount_pence: 1800, refundable_pence: 1800 })],
    });
    const send = jest.fn().mockResolvedValue({ sale: paid, refunds: [] });
    await render(
      <RefundSheet visible onClose={jest.fn()} sale={paid} bootstrap={bootstrap()} send={send} cancelSale={false} onRefunded={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Items'));
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Shampoo (£18.00)'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(screen.getByText('Tick this if it can be sold again.')).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByLabelText('Put back in stock: Shampoo'), 'valueChange', true);
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Product returned'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Refund £18.00'));
    });
    const body = (send.mock.calls[0]![0] as { body: { lines: unknown } }).body;
    expect(body.lines).toEqual([{ line_id: 'line-p', quantity: 1, restock: true }]);
  });
});

describe('Reward ready (Pass LC, §21.3)', () => {
  const withClient = makeSale({ guest: { id: 'g1', name: 'Jo Bloggs', email: null, phone: null } });

  it('shows nothing when no reward is waiting', async () => {
    await render(<RewardReadyChip sale={withClient} bootstrap={bootstrap()} send={jest.fn()} />);
    expect(screen.queryByText('Reward ready')).toBeNull();
  });

  it('applies a waiting reward with the sale version, and explains one that cannot go on', async () => {
    mockRewards = [
      { id: 'r1', text: 'a free Cut', applicable: false, applied: false, blocked_reason: 'Add Cut to the sale to use this reward.' },
      { id: 'r2', text: '£5.00 off', applicable: true, applied: false, blocked_reason: null },
      { id: 'r3', text: '10% off', applicable: true, applied: true, blocked_reason: null },
    ];
    const send = jest.fn().mockResolvedValue({ sale: withClient });
    await render(<RewardReadyChip sale={withClient} bootstrap={bootstrap()} send={send} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Reward ready'));
    });
    expect(screen.getByText("Jo Bloggs's reward")).toBeTruthy();
    expect(screen.getByText('Add Cut to the sale to use this reward.')).toBeTruthy();
    expect(screen.getByText('£5.00 off. Use it on this sale?')).toBeTruthy();
    expect(screen.queryByText('10% off. Use it on this sale?')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Use the reward'));
    });
    expect(send).toHaveBeenCalledWith({ action: 'loyalty-reward', body: { version: withClient.version, reward_id: 'r2' } });
  });

  it('offers no button without take_payment', async () => {
    mockRewards = [{ id: 'r2', text: '£5.00 off', applicable: true, applied: false, blocked_reason: null }];
    await render(<RewardReadyChip sale={withClient} bootstrap={bootstrap({ capabilities: {} })} send={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Reward ready'));
    });
    expect(screen.queryByText('Use the reward')).toBeNull();
  });
});
