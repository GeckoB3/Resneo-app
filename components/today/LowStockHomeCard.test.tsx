/**
 * The Today "Low stock" card: web parity with the dashboard home's LowStockHomeCard. Asked only
 * with POS on; hidden while Track stock is off (`enabled: false`), when nothing is low or when it
 * cannot be loaded; up to five rows; "See what's low" opens the Levels tab on the Low filter.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LOW_STOCK_HREF, LowStockHomeCard, lowStockBody } from './LowStockHomeCard';
import { stockCopy } from '@/lib/retail/stock-setup-copy';
import type { LowStockResponse } from '@/lib/queries/useLowStock';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'client' } }),
}));

let mockPosOn = true;
let mockData: LowStockResponse | undefined;
const mockUseLowStock = jest.fn();
jest.mock('@/lib/queries/usePos', () => ({ usePosEnabled: () => mockPosOn }));
jest.mock('@/lib/queries/useLowStock', () => ({
  ...jest.requireActual('@/lib/queries/useLowStock'),
  useLowStock: (opts: unknown) => {
    mockUseLowStock(opts);
    return { data: mockData };
  },
}));

function item(n: number, on_hand: number, option_name: string | null = null) {
  return { variant_id: `v${n}`, product_id: `p${n}`, product_name: `Product ${n}`, option_name, on_hand, reorder_level: 3 };
}

beforeEach(() => {
  mockPosOn = true;
  mockData = undefined;
  mockPush.mockClear();
  mockUseLowStock.mockClear();
});

describe('LowStockHomeCard', () => {
  it('asks nothing and shows nothing with POS off', async () => {
    mockPosOn = false;
    mockData = { enabled: true, count: 1, out_count: 0, items: [item(1, 1)] };
    await render(<LowStockHomeCard />);
    expect(screen.queryByText('Low stock')).toBeNull();
    expect(mockUseLowStock).toHaveBeenCalledWith({ enabled: false });
  });

  it('hides while Track stock is off', async () => {
    mockData = { enabled: false, count: 0, out_count: 0, items: [] };
    await render(<LowStockHomeCard />);
    expect(screen.queryByText('Low stock')).toBeNull();
  });

  it('hides when it has not loaded', async () => {
    await render(<LowStockHomeCard />);
    expect(screen.queryByText('Low stock')).toBeNull();
  });

  it('hides when nothing is low', async () => {
    mockData = { enabled: true, count: 0, out_count: 0, items: [] };
    await render(<LowStockHomeCard />);
    expect(screen.queryByText('Low stock')).toBeNull();
  });

  it('lists up to five, with out of stock called out, and links to the low filter', async () => {
    mockData = {
      enabled: true,
      count: 7,
      out_count: 1,
      items: [item(1, 0, 'Large'), item(2, 2), item(3, 2), item(4, 2), item(5, 3), item(6, 3)],
    };
    await render(<LowStockHomeCard />);
    expect(screen.getByText('Low stock')).toBeTruthy();
    expect(screen.getByText('7 products are at or below their reorder level.')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.getByText(', Large')).toBeTruthy();
    expect(screen.getAllByText('In stock: 2')).toHaveLength(3);
    expect(screen.getAllByText('Reorder at: 3')).toHaveLength(5);
    expect(screen.queryByText('Product 6')).toBeNull();
    await fireEvent.press(screen.getByText("See what's low →"));
    expect(mockPush).toHaveBeenCalledWith('/stock?tab=levels&filter=low');
    expect(LOW_STOCK_HREF).toBe('/stock?tab=levels&filter=low');
  });
});

describe('lowStockBody', () => {
  it('reads one item in the singular', () => {
    expect(lowStockBody(1, stockCopy)).toBe('1 product is at or below its reorder level.');
    expect(lowStockBody(2, stockCopy)).toBe('2 products are at or below their reorder level.');
  });
});
