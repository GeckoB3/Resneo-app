/**
 * A stocktake in the app (POS app step 4, UX spec §6.11, §13.6; test plan STK-03): counting by
 * scan, +1 and a typed count; counts kept on the phone while offline (`app.stocktake.offline`) and
 * sent again with the same request id, so each is recorded once; an option outside a partial
 * count; and the commit's confirmation.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'st1' }),
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { addEventListener: () => () => undefined } }));
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
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/usePos', () => ({
  usePosEnabled: () => true,
  usePosBootstrap: () => ({ data: { venue: { name: 'Studio', currency: 'GBP', timezone: 'Europe/London' } }, isLoading: false }),
}));
let mockDetail: Record<string, unknown>;
const mockPost = jest.fn();
const mockAction = jest.fn();
jest.mock('@/lib/queries/useRetail', () => ({
  ...jest.requireActual<typeof import('@/lib/queries/useRetail')>('@/lib/queries/useRetail'),
  useStocktake: () => ({ data: mockDetail, isLoading: false, refetch: jest.fn() }),
  postStocktakeCount: (...args: unknown[]) => mockPost(...args),
  useStocktakeAction: () => ({ mutateAsync: mockAction, isPending: false, variables: undefined }),
}));
const mockSaved: unknown[][] = [];
jest.mock('@/lib/retail/stocktake-draft', () => ({
  ...jest.requireActual<typeof import('@/lib/retail/stocktake-draft')>('@/lib/retail/stocktake-draft'),
  loadStocktakeDraft: async () => [],
  saveStocktakeDraft: async (_id: string, pending: unknown[]) => {
    mockSaved.push(pending);
  },
}));

import StocktakeScreen from '@/app/(app)/stock/stocktake/[id]';
import { ApiError } from '@/lib/api/client';

function line(over: Record<string, unknown> = {}) {
  return {
    variant_id: 'v1',
    product_id: 'p1',
    product_name: 'Shampoo',
    option_name: '250 ml',
    sku: 'SH250',
    barcodes: ['5012345678900'],
    in_scope: true,
    expected_at_start: 5,
    counted: null,
    counted_at: null,
    last_counted_by_name: null,
    moved_since: 0,
    on_hand_now: 5,
    reserved: 0,
    tracked: true,
    change: null,
    value_pence: null,
    zeroed: null,
    flagged_for_review: null,
    ...over,
  };
}

function detail(status: string, lines = [line()]) {
  return {
    stocktake: {
      id: 'st1',
      number: 3,
      name: 'Stocktake Friday 9 October',
      scope: { type: 'full' },
      status,
      started_by_name: 'Sam',
      started_at: '2026-10-09T09:00:00Z',
      committed_by_name: null,
      committed_at: null,
      cancelled_at: null,
      variance_value_pence: null,
      zero_uncounted: false,
      version: 2,
    },
    lines,
    counters: ['Sam'],
    uncounted_held: 0,
    can_count: true,
    can_commit: true,
  };
}

beforeEach(() => {
  mockPost.mockReset();
  mockAction.mockReset();
  mockSaved.length = 0;
  mockDetail = detail('counting');
});

it('keeps a count made offline on the phone, then sends it again with the same request id', async () => {
  mockPost.mockRejectedValueOnce(new ApiError('Network request failed. Check your connection and try again.', 0));
  await render(<StocktakeScreen />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('+1 Shampoo, 250 ml'));
  });
  expect(screen.getByText("You're offline. Your counts are saved on this phone and will be sent when you're back online.")).toBeTruthy();
  expect(screen.getByText('Counted: 1, SH250')).toBeTruthy();
  expect(screen.getByText('Waiting to send')).toBeTruthy();
  expect(mockSaved.at(-1)).toHaveLength(1);

  mockPost.mockResolvedValueOnce({ variant_id: 'v1', counted: 1, counted_at: '2026-10-09T10:00:00Z' });
  await act(async () => {
    fireEvent.press(screen.getByText('Send them now'));
  });
  expect(mockPost).toHaveBeenCalledTimes(2);
  const first = mockPost.mock.calls[0]![2] as { clientRequestId: string; kind: string; quantity: number };
  const second = mockPost.mock.calls[1]![2] as { clientRequestId: string };
  expect(first).toMatchObject({ variantId: 'v1', kind: 'add', quantity: 1 });
  expect(second.clientRequestId).toBe(first.clientRequestId);
  expect(mockSaved.at(-1)).toEqual([]);
  expect(screen.queryByText('Waiting to send')).toBeNull();
});

it('adds one for a scanned barcode, and offers to count an option outside a partial count', async () => {
  mockPost.mockResolvedValueOnce({ variant_id: 'v1', counted: 1, counted_at: '2026-10-09T10:00:00Z' });
  await render(<StocktakeScreen />);
  const field = screen.getByLabelText('Scan or search');
  await act(async () => {
    fireEvent.changeText(field, '5012345678900');
  });
  await act(async () => {
    fireEvent(field, 'submitEditing');
  });
  expect(screen.getByText('+1 Shampoo, 250 ml')).toBeTruthy();
  expect(mockPost.mock.calls[0]![2]).toMatchObject({ variantId: 'v1', kind: 'add', quantity: 1 });

  mockPost.mockRejectedValueOnce(
    new ApiError("Shampoo, 250 ml isn't part of this stocktake.", 409, { error: 'x', out_of_scope: true }),
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('+1 Shampoo, 250 ml'));
  });
  expect(screen.getByText("Shampoo, 250 ml isn't part of this stocktake.")).toBeTruthy();
  mockPost.mockResolvedValueOnce({ variant_id: 'v1', counted: 2, counted_at: '2026-10-09T10:01:00Z' });
  await act(async () => {
    fireEvent.press(screen.getByText('Count it anyway'));
  });
  expect(mockPost.mock.calls[2]![2]).toMatchObject({ countAnyway: true });
});

it('asks before updating stock from the review, with what changes', async () => {
  mockDetail = detail('review', [line({ counted: 3, change: -2, value_pence: -1400 })]);
  mockAction.mockResolvedValue({});
  await render(<StocktakeScreen />);
  expect(screen.getByText('Difference at cost: -£14.00')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getAllByText('Update stock')[0]!);
  });
  expect(
    screen.getByText("1 product options change, worth -£14.00 at cost. This can't be undone, but the stocktake stays in your records."),
  ).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getAllByText('Update stock').at(-1)!);
  });
  expect(mockAction).toHaveBeenCalledWith({ action: 'commit', version: 2, zeroUncounted: false });
});
