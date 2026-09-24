/**
 * useUnlinkFromHousehold (web QA FD-9, 2026-09-23): DELETE
 * /api/venue/guests/[guestId]/household?other_guest_id=, then refresh BOTH
 * contacts' household blocks (and timelines, which gain a "household unlinked"
 * entry), since the link is symmetric.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useUnlinkFromHousehold } from '@/lib/queries/useGuestHousehold';

function setup() {
  const client = new QueryClient({
    // gcTime Infinity schedules no garbage-collection timer, so jest can exit.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { invalidate, Wrapper };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('useUnlinkFromHousehold', () => {
  it('DELETEs with the other contact in the query and refreshes both contacts', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true, household_ids: ['hh-1'], dissolved: true });
    const { invalidate, Wrapper } = setup();
    const { result } = await renderHook(() => useUnlinkFromHousehold('guest-a'), { wrapper: Wrapper });

    let response: unknown;
    await act(async () => {
      response = await result.current.mutateAsync('guest-b');
      // Let the query cache's batched notifications land inside act.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/guests/guest-a/household?other_guest_id=guest-b',
      expect.objectContaining({ method: 'DELETE', accessToken: 'token-A' }),
    );
    expect(response).toEqual({ success: true, household_ids: ['hh-1'], dissolved: true });

    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(keys.some((k) => k.includes('"household"') && k.includes('"guest-a"'))).toBe(true);
    expect(keys.some((k) => k.includes('"household"') && k.includes('"guest-b"'))).toBe(true);
    expect(keys.some((k) => k.includes('"timeline"') && k.includes('"guest-b"'))).toBe(true);
  });

  it('refreshes the one contact once when it leaves the household itself', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true, household_ids: ['hh-1'], dissolved: false });
    const { invalidate, Wrapper } = setup();
    const { result } = await renderHook(() => useUnlinkFromHousehold('guest-a'), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('guest-a');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const householdKeys = invalidate.mock.calls
      .map(([filters]) => JSON.stringify(filters?.queryKey))
      .filter((k) => k.includes('"household"'));
    expect(householdKeys).toHaveLength(1);
  });
});
