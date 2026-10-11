/**
 * "Sell products" (POS Part 4, OB3): switched off, the till's Add items has no Products tab, no
 * scanning and no product favourites, while the service favourites stay; on, or not sent by an
 * older server, it is exactly as before.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AddItemsSheet } from '@/components/pos/SaleSheets';
import { makeSale } from '@/lib/pos/test-sale';
import type { PosBootstrap, PosCatalogueProduct } from '@/types/pos';

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
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: true } } } }),
}));

let mockCatalogue: Record<string, unknown> | null = null;
jest.mock('@/lib/queries/usePos', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/usePos')>('@/lib/queries/usePos'),
  usePosCatalogue: () => ({ data: mockCatalogue, isLoading: false, isError: false }),
  useProductSearch: () => ({ data: mockCatalogue, isLoading: false, isError: false }),
  lookupBarcode: jest.fn(),
  lookupScannedBarcode: jest.fn(),
  useVoucherSettings: () => ({ data: null, isLoading: false }),
}));


const SHAMPOO: PosCatalogueProduct = {
  id: 'p1',
  name: 'Repair Shampoo',
  brand_name: null,
  restriction: 'none',
  options: [{ id: 'v1', name: '250 ml', sku: null, price_pence: 1850, track_stock: false, on_hand: 0, available: 0 }],
};

function bootstrap(settings: PosBootstrap['settings']): PosBootstrap {
  return {
    settings,
    capabilities: { take_payment: true, create_sale: true, custom_line: true },
    role: 'staff',
    tills: [],
    payment_types: [],
    discount_presets: [],
    tip_settings: { tipping_enabled: false },
    operators: [],
    card_methods: { card_app: false },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
  };
}

const sale = makeSale({ operator: { calendar_id: 'cal-1', staff_id: null, name: 'Sam' } });

async function renderAdd(settings: PosBootstrap['settings']) {
  await render(
    <AddItemsSheet visible onClose={jest.fn()} sale={sale} bootstrap={bootstrap(settings)} send={jest.fn()} myCalendarIds={[]} />,
  );
}

const BLOW_DRY = {
  id: 's1',
  name: 'Blow-dry',
  price_pence: 2800,
  duration_minutes: 30,
  options: [],
  calendars: [{ calendar_id: 'cal-1', name: 'Sam' }],
};

beforeEach(() => {
  mockCatalogue = {
    services: [BLOW_DRY],
    favourites: [
      { id: 'f1', item_type: 'service', item_id: 's1', sort_order: 0 },
      { id: 'f2', item_type: 'variant', item_id: 'v1', sort_order: 1 },
    ],
    favourite_products: [SHAMPOO],
    products: [SHAMPOO],
    suggested: [],
    stock: { track_stock: false, sell_beyond_stock: true },
  };
});

describe('"Sell products" at the till', () => {
  it('shows the Products tab and product favourites while it is on, or not sent by an older server', async () => {
    await renderAdd({ sell_products_enabled: true });
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('Repair Shampoo, 250 ml')).toBeTruthy();
    await renderAdd({});
    expect(screen.getByText('Products')).toBeTruthy();
  });

  it('has no Products tab and no product favourites once it is off, keeping the service favourites', async () => {
    await renderAdd({ sell_products_enabled: false });
    expect(screen.queryByText('Products')).toBeNull();
    expect(screen.getByText('Favourites')).toBeTruthy();
    expect(screen.getByText('Blow-dry')).toBeTruthy();
    expect(screen.queryByText('Repair Shampoo, 250 ml')).toBeNull();
    expect(screen.getByText('Services')).toBeTruthy();
  });
});
