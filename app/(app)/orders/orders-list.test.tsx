/**
 * The Orders list's select mode (UX spec §8.1, §8.6 `ord.bulk.*`): "Select" in the header, tap
 * rows to tick them instead of opening them, cancelled orders cannot be ticked, at most 50, and
 * the bar's "Print packing slips" gets the ticked orders. "Done" ends it and clears the ticks.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    // The header's right button renders inline so the test can press it.
    Stack: {
      Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) =>
        options?.headerRight ? React.createElement(View, null, options.headerRight()) : null,
    },
    useRouter: () => ({ push: mockPush }),
  };
});
const mockPush = jest.fn();
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null, cameraScanAvailable: false }));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({ isLoading: false, data: { capabilities: { manage_orders: true }, venue: { name: 'Studio', timezone: 'Europe/London' } } }),
}));
let mockRows: unknown[] = [];
jest.mock('@/lib/queries/useOrders', () => ({
  useShopOrders: () => ({
    data: {
      pages: [
        {
          orders: mockRows,
          next_cursor: null,
          counts: { todo: 0, ready: 0, sent: 0, done: 0, cancelled: 0, all: mockRows.length },
          venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' },
        },
      ],
    },
    isLoading: false,
    isError: false,
    isRefetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
  }),
  lookupOrderByPickupCode: jest.fn(),
}));
// The bar's own behaviour is PackingSlipBar.test.tsx; here it shows what the screen hands it.
let mockBarSelected: { id: string; number: number }[] = [];
jest.mock('@/components/shop/PackingSlipBar', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PackingSlipBar: ({ selected }: { selected: { id: string; number: number }[] }) => {
      mockBarSelected = selected;
      return React.createElement(Text, null, `bar: ${selected.map((o) => o.number).join(',') || 'none'}`);
    },
  };
});

import OrdersScreen from './index';

function row(id: string, number: number, status = 'new') {
  return {
    id,
    number,
    customer_name: 'Ana',
    customer_email: null,
    total_pence: 1200,
    item_count: 1,
    fulfilment_type: 'collection',
    fulfilment_status: status,
    created_at: '2026-10-09T09:00:00Z',
    flags: { past_hold_since: null, refund_status: 'none', return_recorded: false, refund_due_by: null },
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockToast.info.mockClear();
  mockBarSelected = [];
  mockRows = [row('o1', 12), row('o2', 15, 'cancelled'), row('o3', 20, 'ready')];
});

async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}

it('opens an order on tap until Select is pressed', async () => {
  await render(<OrdersScreen />);
  expect(screen.queryByText(/^bar:/)).toBeNull();
  await press(screen.getByText('Order 12 · Ana'));
  expect(mockPush).toHaveBeenCalledWith('/orders/o1');
});

it('ticks orders in select mode, skips cancelled ones and hands the ticks to the bar', async () => {
  await render(<OrdersScreen />);
  await press(screen.getByText('Select'));
  expect(screen.getByText('bar: none')).toBeTruthy();

  await press(screen.getByLabelText('Order 20'));
  await press(screen.getByLabelText('Order 12'));
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Order 12').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  expect(mockBarSelected.map((o) => o.number)).toEqual([20, 12]);

  await press(screen.getByLabelText('Order 15'));
  expect(mockToast.info).toHaveBeenCalledWith("Cancelled orders don't have a packing slip.");
  expect(mockBarSelected.map((o) => o.number)).toEqual([20, 12]);

  // Tapping a ticked order unticks it.
  await press(screen.getByLabelText('Order 20'));
  expect(mockBarSelected.map((o) => o.number)).toEqual([12]);

  await press(screen.getByText('Done'));
  expect(screen.queryByText(/^bar:/)).toBeNull();
  await press(screen.getByText('Select'));
  expect(screen.getByText('bar: none')).toBeTruthy();
});

it('stops at 50 ticked orders, as the web prints at most 50', async () => {
  mockRows = Array.from({ length: 51 }, (_, i) => row(`o${i + 1}`, i + 1));
  await render(<OrdersScreen />);
  await press(screen.getByText('Select'));
  for (let i = 1; i <= 50; i += 1) await press(screen.getByLabelText(`Order ${i}`));
  expect(mockBarSelected).toHaveLength(50);
  await press(screen.getByLabelText('Order 51'));
  expect(mockBarSelected).toHaveLength(50);
  expect(mockToast.info).toHaveBeenCalledWith('You can print up to 50 packing slips at a time.');
}, 30_000); // Fifty rows to render and tick: slow under a full parallel run.
