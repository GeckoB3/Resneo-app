/**
 * The product editor in the app (UX spec §6.2, §6.3; web `ProductEditor.tsx`, 2026-10-09 parity):
 * a new product sends the web's fields (description, hygiene seal, manufacturer, supplier with
 * Track stock on, size and unit with the unit price preview, pack size), a brand can be added by
 * name, a product with history is archived rather than deleted, and staff without
 * `manage_products` see the fields read only with no Save.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn().mockResolvedValue(undefined) }));
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'new' };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: mockBack }),
}));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null, cameraScanAvailable: false }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
let mockBoot: Record<string, unknown>;
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({ data: mockBoot, isLoading: false }),
}));
const mockSave = jest.fn();
const mockDelete = jest.fn();
let mockProduct: Record<string, unknown> | null = null;
jest.mock('@/lib/queries/useRetail', () => ({
  ProductStaleError: class extends Error {},
  removeProductPhoto: jest.fn(),
  uploadProductPhoto: jest.fn(),
  useArchiveProduct: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteProduct: () => ({ mutateAsync: mockDelete, isPending: false }),
  useRetailProduct: () => ({ data: mockProduct ? { product: mockProduct } : undefined, isLoading: false }),
  useSaveProduct: () => ({ mutateAsync: mockSave, isPending: false }),
  useAdjustStock: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRetailNamed: () => ({ data: [] }),
  useStartStocktake: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStockMovements: () => ({ data: undefined, isLoading: false }),
}));
const mockAddNamed = jest.fn();
jest.mock('@/lib/queries/useStockSetup', () => ({
  countProducts: jest.fn().mockResolvedValue(3),
  useAddNamed: () => ({ mutateAsync: mockAddNamed, isPending: false, variables: undefined }),
  useNamedList: (kind: string) => ({ data: kind === 'suppliers' ? [{ id: 'sup1', name: 'Wella' }] : [] }),
  useTurnOnTrackStock: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import ProductScreen from '@/app/(app)/stock/product/[id]';

function boot(caps: Record<string, boolean>, over: Record<string, unknown> = {}) {
  return {
    capabilities: caps,
    role: 'staff',
    settings: { track_stock_enabled: true },
    tax_settings: { vat_registered: false, jurisdiction: 'gb' },
    venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
    ...over,
  };
}

const SAVED = {
  id: 'p9',
  name: 'Argan oil',
  slug: 'argan-oil',
  brand_id: null,
  brand_name: null,
  category_id: null,
  category_name: null,
  supplier_id: 'sup1',
  supplier_name: 'Wella',
  description: 'For dry hair.',
  photos: [],
  usage: 'retail',
  sold_in_store: true,
  sold_online: true,
  hygiene_sealed: true,
  tax_category: null,
  restriction: 'none',
  unit_price_basis: 'standard',
  manufacturer_name: 'Maker Ltd',
  manufacturer_address: null,
  manufacturer_contact: null,
  archived_at: null,
  version: 1,
  created_at: '2026-10-09T10:00:00Z',
  updated_at: '2026-10-09T10:00:00Z',
  can_delete: true,
  variants: [
    {
      id: 'v9',
      option_name: null,
      sku: null,
      price_pence: 1450,
      cost_pence: null,
      net_quantity: 250,
      net_unit: 'ml',
      track_stock: true,
      reorder_level: null,
      reorder_quantity: null,
      order_up_to_level: null,
      pack_size: 6,
      sort_order: 0,
      archived_at: null,
      on_hand: 0,
      reserved: 0,
      barcodes: [],
    },
  ],
};

beforeEach(() => {
  mockParams = { id: 'new' };
  mockProduct = null;
  mockBoot = boot({ manage_products: true, adjust_stock: true });
  mockSave.mockReset();
  mockDelete.mockReset();
  mockAddNamed.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockToast.success.mockReset();
});

describe('the product editor', () => {
  it("sends the web's fields for a new product, with the unit price preview", async () => {
    mockSave.mockResolvedValue(SAVED);
    await render(<ProductScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Name'), 'Argan oil');
      fireEvent.changeText(screen.getByLabelText('Description'), 'For dry hair.');
      fireEvent.changeText(screen.getByLabelText('Manufacturer'), 'Maker Ltd');
      fireEvent.changeText(screen.getByLabelText('Price'), '14.50');
      fireEvent.changeText(screen.getByLabelText('Size'), '250');
      fireEvent.changeText(screen.getByLabelText('Pack size'), '6');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('ml'));
      fireEvent.press(screen.getByText('Wella'));
      fireEvent(screen.getByLabelText('Sealed for hygiene reasons'), 'valueChange', true);
    });
    expect(screen.getByText('Shows as £58.00 per litre')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Save product'));
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const input = mockSave.mock.calls[0]![0] as { kind: string; body: Record<string, unknown>; clientRequestId: string };
    expect(input.kind).toBe('create');
    expect(input.clientRequestId).toBeTruthy();
    expect(input.body).toMatchObject({
      name: 'Argan oil',
      description: 'For dry hair.',
      hygiene_sealed: true,
      manufacturer_name: 'Maker Ltd',
      supplier_id: 'sup1',
    });
    expect((input.body.variants as Record<string, unknown>[])[0]).toMatchObject({
      price_pence: 1450,
      net_quantity: 250,
      net_unit: 'ml',
      pack_size: 6,
    });
    expect(mockReplace).toHaveBeenCalledWith('/stock/product/p9');
  });

  it('adds a brand by name', async () => {
    mockAddNamed.mockResolvedValue({ id: 'b1', name: 'Kerastase' });
    await render(<ProductScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Brand: Add a new one'), 'Kerastase');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add "Kerastase" as a new brand'));
    });
    expect(mockAddNamed).toHaveBeenCalledWith({ kind: 'brands', name: 'Kerastase' });
  });

  it('says a product with history was archived rather than deleted, and stays', async () => {
    mockParams = { id: 'p9' };
    mockProduct = SAVED;
    mockDelete.mockResolvedValue({ deleted: false, archived: true });
    await render(<ProductScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Delete product'));
    });
    const del = screen.getAllByText('Delete product');
    await act(async () => {
      fireEvent.press(del[del.length - 1]!);
    });
    expect(mockDelete).toHaveBeenCalledWith('p9');
    expect(mockToast.success).toHaveBeenCalledWith('Product archived.');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows the fields read only without manage_products', async () => {
    mockParams = { id: 'p9' };
    mockProduct = SAVED;
    mockBoot = boot({ manage_products: false });
    await render(<ProductScreen />);
    expect(screen.getByText('You can look products up here. An admin can let you edit them.')).toBeTruthy();
    expect(screen.getByDisplayValue('For dry hair.')).toBeTruthy();
    expect(screen.getByText('Wella')).toBeTruthy();
    expect(screen.queryByText('Save product')).toBeNull();
    expect(screen.queryByText('Archive product')).toBeNull();
  });
});
