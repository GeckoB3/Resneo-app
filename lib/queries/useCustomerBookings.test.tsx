/**
 * C2: reading and changing the caller's own bookings.
 *
 * The route layer already refuses to answer about anybody else, so what these
 * pin is the CLIENT's half: that a change invalidates everything showing the
 * old answer, and that the id it acts on is the one it was given.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

const {
  useCustomerBookings,
  useCustomerBookingDetail,
  useCancelBooking,
  useConfirmAttendance,
  useRescheduleBooking,
  useRescheduleOptions,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('./useCustomerBookings') as typeof import('./useCustomerBookings');

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockApiFetch.mockReset().mockResolvedValue({ bookings: [] });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

/** The path the last call was made against. */
function lastPath(): string {
  return String(mockApiFetch.mock.calls.at(-1)?.[0]);
}

/** The options object of the last call. */
function lastOpts(): { method?: string; body?: string; accessToken?: string } {
  return (mockApiFetch.mock.calls.at(-1)?.[1] ?? {}) as never;
}

describe('reading', () => {
  it('asks the versioned customer path for the list', async () => {
    await renderHook(() => useCustomerBookings(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(lastPath()).toBe('/api/v1/me/bookings');
    expect(lastOpts().accessToken).toBe('token-A');
  });

  it('encodes the booking id rather than splicing it in raw', async () => {
    /*
      The id comes from a route param. It is a uuid in practice, but a client
      that concatenates unencoded input into a path is one odd value away from
      requesting something else entirely.
    */
    mockApiFetch.mockResolvedValue({ booking_id: 'a b/c' });
    await renderHook(() => useCustomerBookingDetail('a b/c'), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(lastPath()).toBe('/api/v1/me/bookings/a%20b%2Fc');
  });

  it('asks for nothing at all without a booking id', async () => {
    await renderHook(() => useCustomerBookingDetail(null), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('does not ask whether a booking can be moved when told not to', async () => {
    /*
      The sheet is closed most of the time, and this question costs a round trip
      per booking opened. Gating it is why `enabled` exists on the hook.
    */
    await renderHook(() => useRescheduleOptions('bk-1', false), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('changing', () => {
  it('cancels with DELETE on the booking itself', async () => {
    const { result } = await renderHook(() => useCancelBooking('bk-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(lastPath()).toBe('/api/v1/me/bookings/bk-1');
    expect(lastOpts().method).toBe('DELETE');
  });

  it('confirms attendance with POST, sending no body to guess at', async () => {
    const { result } = await renderHook(() => useConfirmAttendance('bk-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(lastPath()).toBe('/api/v1/me/bookings/bk-1/confirm');
    expect(lastOpts().method).toBe('POST');
    expect(lastOpts().body).toBeUndefined();
  });

  it('sends only the named reschedule fields', async () => {
    /*
      `reschedule-options` returns `required_fields` precisely because the
      models take different bodies. Forwarding an object wholesale would let a
      client set keys the service might later come to read.
    */
    const { result } = await renderHook(() => useRescheduleBooking('bk-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ booking_date: '2026-09-01', booking_time: '10:00' });
    });
    expect(lastPath()).toBe('/api/v1/me/bookings/bk-1/reschedule');
    expect(JSON.parse(lastOpts().body ?? '{}')).toEqual({
      booking_date: '2026-09-01',
      booking_time: '10:00',
    });
  });

  it('refuses to act with no booking id, rather than calling a malformed path', async () => {
    const { result } = await renderHook(() => useCancelBooking(null), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow();
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('what a change invalidates', () => {
  /*
    The same booking appears in three places: the hub aggregate calls it "next",
    the list contains it, and the detail IS it. A cancel that refreshed only the
    detail would leave a cancelled booking still showing as what is coming up,
    which is the kind of stale screen people ring a venue about.
  */
  it.each([
    ['cancel', () => useCancelBooking('bk-1')],
    ['confirm', () => useConfirmAttendance('bk-1')],
  ])('%s refreshes everything showing the old answer', async (_label, hook) => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(hook, { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    // If this fails, nothing under the customer surface was invalidated, and a
    // cancelled booking is still showing as "next" on the hub.
    const keys = invalidate.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys.some((k) => k?.includes('customer'))).toBe(true);
  });

  it('a reschedule refreshes them too', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useRescheduleBooking('bk-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ booking_date: '2026-09-01' });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it('does NOT invalidate when the change failed', async () => {
    /*
      An invalidation after a failure refetches the same data and tells the
      customer nothing, while making a failed cancel look like it did something.
    */
    mockApiFetch.mockRejectedValueOnce(new Error('network'));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCancelBooking('bk-1'), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow();
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
