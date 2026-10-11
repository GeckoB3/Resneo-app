/**
 * Orders after Checkout goes off (POS Part 5, design section 7.2): at a venue that has had
 * Checkout, orders still to hand over or send keep their list and their page, read through the
 * routes that stay open with Checkout off (`allowWhenOff`). A venue that never had Checkout keeps
 * today's "Checkout isn't switched on" and asks nothing.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import OrderScreen from './[id]';
import OrdersScreen from './index';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'o1' }),
}));
jest.mock('@/components/ui/Screen', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/components/retail/CameraScanner', () => ({ CameraScanner: () => null, ScanButton: () => null, cameraScanAvailable: false }));
jest.mock('@/components/shop/PackingSlipBar', () => ({ PackingSlipBar: () => null }));
let mockVenue: Record<string, unknown> = {};
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: mockVenue, terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => false,
  // The POS bootstrap refuses while Checkout is off.
  usePosBootstrap: () => ({ isLoading: false, data: undefined }),
}));
const mockListOptions: unknown[] = [];
const mockOrderOptions: unknown[] = [];
jest.mock('@/lib/queries/useOrders', () => ({
  useShopOrders: (_params: unknown, options: unknown) => {
    mockListOptions.push(options);
    return {
      data: {
        pages: [
          {
            orders: [
              {
                id: 'o1',
                number: 12,
                customer_name: 'Ana',
                customer_email: null,
                total_pence: 1200,
                item_count: 1,
                fulfilment_type: 'collection',
                fulfilment_status: 'ready',
                created_at: '2026-10-09T09:00:00Z',
                flags: { past_hold_since: null, refund_status: 'none', return_recorded: false, refund_due_by: null },
              },
            ],
            next_cursor: null,
            counts: { todo: 0, ready: 1, sent: 0, done: 0, cancelled: 0, all: 1 },
            venue: { name: 'Bloom', currency: 'GBP', timezone: 'Europe/London' },
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
    };
  },
  useShopOrder: (_id: unknown, options: unknown) => {
    mockOrderOptions.push(options);
    return { data: undefined, isLoading: true, isRefetching: false, refetch: jest.fn() };
  },
  useOrderWrite: () => ({ mutateAsync: jest.fn(), isPending: false }),
  lookupOrderByPickupCode: jest.fn(),
}));

const switchedOff = { id: 'venue-1', name: 'Bloom', feature_flags: { raw: { pos_enabled: false }, resolved: { pos_enabled: false } } };

beforeEach(() => {
  mockListOptions.length = 0;
  mockOrderOptions.length = 0;
  mockVenue = switchedOff;
});

it('keeps the orders still to finish after Checkout went off', async () => {
  await render(<OrdersScreen />);
  expect(screen.getByText('Order 12 · Ana')).toBeTruthy();
  expect(mockListOptions.at(-1)).toEqual({ enabled: true, finishing: true });
});

it('opens an order with Checkout off', async () => {
  await render(<OrderScreen />);
  expect(screen.queryByText("Checkout isn't switched on")).toBeNull();
  expect(mockOrderOptions.at(-1)).toEqual({ finishing: true });
});

it("keeps today's message at a venue that never had Checkout", async () => {
  mockVenue = { id: 'venue-1', name: 'Bloom', feature_flags: { raw: {}, resolved: {} } };
  await render(<OrdersScreen />);
  expect(screen.getByText("Checkout isn't switched on")).toBeTruthy();
  expect(mockListOptions.at(-1)).toEqual({ enabled: false, finishing: false });
  await render(<OrderScreen />);
  expect(mockOrderOptions.at(-1)).toEqual({ finishing: false });
});
