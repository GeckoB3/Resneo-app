/**
 * The loyalty card's read (UX spec §21.4): the v1 alias with the caller's token, as every `/me`
 * read sends it; its own key on the customer surface; a body without a list read as no cards, as
 * the web reads it; and no request at all without a session.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { queryKeys } from '@/lib/queries/keys';
import { useCustomerLoyalty } from '@/lib/queries/useCustomerLoyalty';

const mockApiFetch = jest.fn();
let mockToken: string | null = 'token-A';

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

const CARD = { venue_id: 'v-1', venue_name: 'Studio', stamps: 3, needed: 10, rewards: [] };

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockToken = 'token-A';
  mockApiFetch.mockReset().mockResolvedValue({ venues: [CARD] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

describe('reading the loyalty cards', () => {
  it("asks the v1 alias with the caller's token, like the hub's other reads", async () => {
    await renderHook(() => useCustomerLoyalty(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/me/loyalty', { accessToken: 'token-A' });
  });

  it('keeps the answer under its own key on the customer surface', async () => {
    // Under `customer.all()`, so the customer surface's one invalidation refreshes it with the rest.
    const { result } = await renderHook(() => useCustomerLoyalty(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const key = queryKeys.customer.loyalty('token-A');
    expect(key.slice(0, queryKeys.customer.all().length)).toEqual([...queryKeys.customer.all()]);
    expect(client.getQueryData(key)).toEqual({ venues: [CARD] });
    expect(result.current.data).toEqual({ venues: [CARD] });
  });

  it('reads a body without a list as no cards, as the web does', async () => {
    mockApiFetch.mockResolvedValue({});
    const { result } = await renderHook(() => useCustomerLoyalty(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ venues: [] });
  });

  it('asks for nothing without a session', async () => {
    mockToken = null;
    const { result } = await renderHook(() => useCustomerLoyalty(), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
