/**
 * C5: waitlist places, and the 409 that is not a failure.
 *
 * A waitlist place resolving while a screen is open is ordinary, not
 * exceptional. Treating the server's 409 as an error would show "something went
 * wrong" to somebody whose only problem is that the thing they were cancelling
 * had already gone.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...a: unknown[]) => mockApiFetch(...a) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError } = require('@/lib/api/client') as typeof import('@/lib/api/client');
const {
  useCustomerWaitlist,
  useLeaveWaitlist,
  isLiveWaitlistEntry,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('./useCustomerWaitlist') as typeof import('./useCustomerWaitlist');

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({ entries: [] });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'w-1',
  venue_id: 'v-1',
  waitlist_kind: 'appointment',
  status: 'waiting',
  desired_date: '2026-09-10',
  desired_time: '10:00:00',
  desired_time_end: null,
  offered_at: null,
  expires_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('reading', () => {
  it('asks the versioned customer path', async () => {
    await renderHook(() => useCustomerWaitlist(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(String(mockApiFetch.mock.calls[0][0])).toBe('/api/v1/me/waitlist');
  });
});

describe('which places a customer can still act on', () => {
  it.each(['waiting', 'active', 'offered', 'pending'])('%s is live', async (status) => {
    expect(isLiveWaitlistEntry(entry({ status }))).toBe(true);
  });

  it.each(['cancelled', 'expired', 'converted', 'declined'])('%s is history', async (status) => {
    // Offering "Leave" on a place that is already gone invites a tap that can
    // only fail.
    expect(isLiveWaitlistEntry(entry({ status }))).toBe(false);
  });
});

describe('leaving', () => {
  it('deletes the entry by id, encoded', async () => {
    const { result } = await renderHook(() => useLeaveWaitlist(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync('w 1/2');
    });
    expect(outcome).toEqual({ status: 'left' });
    expect(String(mockApiFetch.mock.calls.at(-1)?.[0])).toBe('/api/v1/me/waitlist/w%201%2F2');
  });

  it('reads a 409 as "already gone", not as an error', async () => {
    /*
      The place was taken, expired, or withdrawn between the screen loading and
      the tap. That is the waitlist working, and the customer needs to be told
      what happened rather than shown a failure.
    */
    mockApiFetch.mockRejectedValueOnce(new ApiError('Gone', 409));
    const { result } = await renderHook(() => useLeaveWaitlist(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync('w-1');
    });
    expect(outcome).toEqual({ status: 'already_gone' });
  });

  it('still throws on a real failure', async () => {
    mockApiFetch.mockRejectedValueOnce(new ApiError('Server error', 500));
    const { result } = await renderHook(() => useLeaveWaitlist(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('w-1')).rejects.toThrow();
    });
  });

  it('REFRESHES after a 409, unlike the card removal', async () => {
    /*
      The opposite call to the one card removal makes, and for a reason. A 409
      there means nothing changed and the screen is still right. A 409 here
      means the list on screen is ALREADY WRONG, so refetching is the point.
    */
    mockApiFetch.mockRejectedValueOnce(new ApiError('Gone', 409));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useLeaveWaitlist(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('w-1');
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });
});
