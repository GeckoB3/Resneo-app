/**
 * `useStaffCollective` reads the live collective the venue books for (web
 * 2026-09-04). Pinned here: the route it calls, that it carries the Bearer, and
 * that the caller's `enabled` gate (the linked feed) holds it back, so a venue
 * with no linked calendars never asks.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({
  isBackendConfigured: () => true,
  getApiUrl: () => 'https://api.test',
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useStaffCollective } from '@/lib/queries/useStaffCollective';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

describe('useStaffCollective', () => {
  it('asks the staff-collective route with the Bearer and returns the collective', async () => {
    mockApiFetch.mockResolvedValue({
      collective: {
        id: 'col-1',
        name: 'The Hair Collective',
        host_venue_id: 'venue-host',
        member_venue_ids: ['venue-host', 'venue-member'],
        calendar_ids: ['cal-1', 'cal-2'],
      },
    });

    const { result } = await renderHook(() => useStaffCollective(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/venue/staff-collective', {
      accessToken: mockToken,
    });
    expect(result.current.data?.collective?.id).toBe('col-1');
    expect(result.current.data?.collective?.calendar_ids).toEqual(['cal-1', 'cal-2']);
  });

  it('answers null for a venue that books for itself', async () => {
    mockApiFetch.mockResolvedValue({ collective: null });

    const { result } = await renderHook(() => useStaffCollective(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.collective).toBeNull();
  });

  it('does not ask while the caller holds it back', async () => {
    const { result } = await renderHook(() => useStaffCollective({ enabled: false }), {
      wrapper: makeWrapper(),
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
