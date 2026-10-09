/**
 * The products list in the app (UX spec §6.1, §6.4; web `ProductsList.tsx`): read only without
 * `manage_products`, Import and Export by capability, filters sent to the server, and select mode
 * with a bulk price change (with its preview) and a bulk archive after asking.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

const mockBulk = jest.fn();
const mockListCalls: unknown[][] = [];
function mockItem(id: string, name: string, price: number) {
  return {
    id,
    name,
    slug: id,
    brand_id: null,
    brand_name: 'Kerastase',
    category_id: null,
    category_name: null,
    supplier_id: null,
    supplier_name: null,
    usage: 'retail',
    sold_in_store: true,
    sold_online: false,
    hygiene_sealed: false,
    restriction: 'none',
    tax_category: null,
    unit_price_basis: 'standard',
    main_photo_url: null,
    archived_at: null,
    version: 1,
    variants: [
      {
        id: `${id}-v`,
        option_name: null,
        sku: null,
        price_pence: price,
        cost_pence: null,
        net_quantity: null,
        net_unit: null,
        track_stock: true,
        reorder_level: 2,
        on_hand: 1,
        reserved: 0,
        barcodes: [],
      },
    ],
  };
}
jest.mock('@/lib/queries/useStockSetup', () => ({
  useProductList: (...args: unknown[]) => {
    mockListCalls.push(args);
    return {
      data: { pages: [{ total: 2, items: [mockItem('p1', 'Shampoo', 1000), mockItem('p2', 'Wax', 500)] }] },
      isLoading: false,
      isError: false,
      isRefetching: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      refetch: jest.fn(),
      fetchNextPage: jest.fn(),
    };
  },
  useBulkProducts: () => ({ mutateAsync: mockBulk, isPending: false }),
  useNamedList: (kind: string) => ({ data: kind === 'categories' ? [{ id: 'c1', name: 'Hair care' }] : [] }),
  useShareDownload: () => jest.fn().mockResolvedValue(true),
}));

import { ProductsTab } from '@/components/retail/ProductsTab';

beforeEach(() => {
  mockBulk.mockReset();
  mockPush.mockReset();
  mockToast.success.mockReset();
  mockListCalls.length = 0;
});

describe('the products list', () => {
  it('is read only without manage_products, with Import and Export by capability', async () => {
    await render(<ProductsTab canEdit={false} canImport canExport={false} trackStock />);
    expect(screen.getByText('You can look products up here. An admin can let you edit them.')).toBeTruthy();
    expect(screen.queryByText('Add product')).toBeNull();
    expect(screen.queryByText('Select')).toBeNull();
    expect(screen.queryByText('Export CSV')).toBeNull();
    expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(screen.getByText('Import'));
    });
    expect(mockPush).toHaveBeenCalledWith('/stock/import');
  });

  it('sends the filters to the server', async () => {
    await render(<ProductsTab canEdit canImport={false} canExport trackStock />);
    expect(screen.getByText('Export CSV')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Filters'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Hair care'));
    });
    const last = mockListCalls[mockListCalls.length - 1]!;
    expect(last[0]).toMatchObject({ category_id: 'c1' });
    expect(screen.getByText('Filters (1)')).toBeTruthy();
  });

  it('changes the prices of the selected products, with a preview', async () => {
    mockBulk.mockResolvedValue({ products: 2, options: 2 });
    await render(<ProductsTab canEdit canImport={false} canExport={false} trackStock />);
    await act(async () => {
      fireEvent.press(screen.getByText('Select'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Shampoo'));
      fireEvent.press(screen.getByLabelText('Select Wax'));
    });
    expect(screen.getAllByText('2 selected').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(screen.getAllByText('Change prices')[0]!);
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('By how much'), '10');
    });
    expect(screen.getByText('2 prices will change. For example, Shampoo from £10.00 to £11.00.')).toBeTruthy();
    const confirm = screen.getAllByText('Change prices');
    await act(async () => {
      fireEvent.press(confirm[confirm.length - 1]!);
    });
    expect(mockBulk).toHaveBeenCalledWith({ op: 'price', product_ids: ['p1', 'p2'], which: 'retail', mode: 'increase', percent_bps: 1000 });
    expect(mockToast.success).toHaveBeenCalledWith('Prices changed.');
  });

  it('archives the selected products after asking', async () => {
    mockBulk.mockResolvedValue({ products: 1, options: 1 });
    await render(<ProductsTab canEdit canImport={false} canExport={false} trackStock={false} />);
    await act(async () => {
      fireEvent.press(screen.getByText('Select'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Select Wax'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Archive'));
    });
    expect(screen.getByText('Archive 1 product?')).toBeTruthy();
    expect(mockBulk).not.toHaveBeenCalled();
    const archive = screen.getAllByText('Archive');
    await act(async () => {
      fireEvent.press(archive[archive.length - 1]!);
    });
    expect(mockBulk).toHaveBeenCalledWith({ op: 'archive', product_ids: ['p2'] });
  });
});
