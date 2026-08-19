/**
 * usePractitioners — the `includeResources` roster switch (R19-3).
 *
 * `staff_assignable=1` is the flag the web route filters `calendar_type =
 * 'resource'` on, so it is also what kept resource calendars off the Calendar
 * availability screen — the one place their weekly hours belong, since a
 * resource's hours ARE the same `working_hours` column (`/api/venue/resources`
 * only aliases it as `availability_hours`).
 *
 * The two rosters must not share a cache entry, or whichever screen mounted
 * first would decide what the other one sees.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {},
}));

import { queryKeys } from '@/lib/queries/keys';
import { usePractitioners } from '@/lib/queries/usePractitioners';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** The path the hook fetched, parsed into its query params. */
function paramsOfCall(index: number): URLSearchParams {
  const path = mockApiFetch.mock.calls[index]![0] as string;
  return new URLSearchParams(path.slice(path.indexOf('?') + 1));
}

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({ practitioners: [] });
});

describe('usePractitioners', () => {
  it('asks for the staff-assignable roster by default (no resources)', async () => {
    const { result } = await renderHook(() => usePractitioners(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = paramsOfCall(0);
    expect(params.get('staff_assignable')).toBe('1');
    expect(params.get('roster')).toBe('1');
    expect(params.get('active_only')).toBe('1');
  });

  it('drops staff_assignable when resources are wanted', async () => {
    const { result } = await renderHook(() => usePractitioners({ includeResources: true }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const params = paramsOfCall(0);
    expect(params.has('staff_assignable')).toBe(false);
    // Still the full active roster — only the resource filter is lifted.
    expect(params.get('roster')).toBe('1');
    expect(params.get('active_only')).toBe('1');
  });

  it('keeps the two rosters on separate cache keys', () => {
    expect(queryKeys.practitioners.list('token-A', null, true)).not.toEqual(
      queryKeys.practitioners.list('token-A', null, false),
    );
    // The default is the staff-assignable roster, matching the hook's default.
    expect(queryKeys.practitioners.list('token-A', null)).toEqual(
      queryKeys.practitioners.list('token-A', null, false),
    );
  });

  it('keeps both rosters under practitioners.all() so invalidation still reaches them', () => {
    const all = queryKeys.practitioners.all();
    for (const key of [
      queryKeys.practitioners.list('token-A', null, true),
      queryKeys.practitioners.list('token-A', null, false),
    ]) {
      expect(key.slice(0, all.length)).toEqual([...all]);
    }
  });
});
