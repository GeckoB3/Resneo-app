import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useLinkedGuestHistory } from '@/lib/queries/useLinkedGuestHistory';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('useLinkedGuestHistory', () => {
  it("asks the list route for the guest's history at the owner venue", async () => {
    mockApiFetch.mockResolvedValue({ bookings: [{ id: 'b1' }] });
    const { result } = await renderHook(() => useLinkedGuestHistory('venue-9', 'guest-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path] = mockApiFetch.mock.calls[0] as [string];
    const url = new URL(path, 'https://api.test');
    expect(url.pathname).toBe('/api/venue/bookings/list');
    expect(url.searchParams.get('guest')).toBe('guest-1');
    expect(url.searchParams.get('guest_history')).toBe('1');
    expect(url.searchParams.get('owner_venue_id')).toBe('venue-9');
    expect(result.current.data?.bookings).toEqual([{ id: 'b1' }]);
  });

  it('stays idle without an owner venue or a guest', async () => {
    const { result } = await renderHook(() => useLinkedGuestHistory(null, 'guest-1'), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
