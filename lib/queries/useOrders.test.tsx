/**
 * The Orders tile (UX spec §2.1, §13.7) and the badge's two counts (web, 2026-10-09): with the shop
 * off, the tile stays while any order is still to finish (`unfinished_count`: new, preparing, ready
 * or dispatched), and an older server's `new_count` stands in when `unfinished_count` is absent.
 * The count on the tile stays the new orders.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
const mockVenue = { feature_flags: { raw: {}, resolved: { pos_enabled: true, pos_online_shop_enabled: false } } } as unknown as Pick<
  VenueBootstrap,
  'feature_flags'
>;

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/queries/useVenue', () => ({ useVenue: () => ({ data: mockVenue }) }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { readOrdersBadge, useOrdersTile } from '@/lib/queries/useOrders';
import type { VenueBootstrap } from '@/types/venue';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function answer(badge: Record<string, unknown>) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/venue/pos/bootstrap') return { capabilities: { manage_orders: true } };
    if (path === '/api/venue/shop/orders/badge') return badge;
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => mockApiFetch.mockReset());

describe('readOrdersBadge', () => {
  it('reads both counts', () => {
    expect(readOrdersBadge({ new_count: 1, unfinished_count: 4 })).toEqual({ newCount: 1, unfinishedCount: 4 });
  });

  it('falls back to new_count when unfinished_count is absent (an older server)', () => {
    expect(readOrdersBadge({ new_count: 2 })).toEqual({ newCount: 2, unfinishedCount: 2 });
  });

  it('is null when neither count comes back', () => {
    expect(readOrdersBadge({})).toBeNull();
    expect(readOrdersBadge(null)).toBeNull();
  });
});

describe('useOrdersTile with the shop off', () => {
  it('stays while orders are preparing, ready or dispatched, and counts the new ones', async () => {
    answer({ new_count: 0, unfinished_count: 3 });
    const { result } = await renderHook(() => useOrdersTile(mockVenue), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.newCount).toBe(0);
  });

  it('uses new_count from an older server', async () => {
    answer({ new_count: 2 });
    const { result } = await renderHook(() => useOrdersTile(mockVenue), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.newCount).toBe(2);
  });

  it('goes once nothing is left to finish', async () => {
    answer({ new_count: 0, unfinished_count: 0 });
    const { result } = await renderHook(() => useOrdersTile(mockVenue), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/shop/orders/badge', expect.anything()));
    await waitFor(() => expect(result.current.newCount).toBe(0));
    expect(result.current.enabled).toBe(false);
  });
});
