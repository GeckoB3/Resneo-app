/**
 * R35-1/R35-2 — the "stop offering this service here" flow.
 *
 * The two service-link routes answer 409 with the upcoming bookings that would
 * be left behind, and honour `?acknowledge_affected_bookings=true` on the retry
 * (web #194). These tests pin that the app:
 *   1. holds the refused save and hands the caller the list,
 *   2. rethrows any OTHER failure, so an ordinary 409 still reads as a refusal,
 *   3. moves the chosen bookings before re-sending the save acknowledged, and
 *   4. keeps the panel open on what is left when a move fails, without saving.
 *
 * @see C:\Resneo\src\app\dashboard\availability\AppointmentAvailabilitySettings.tsx
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

// Keep the real ApiError (the flow narrows on `instanceof`); stub only the network.
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import { useServiceRemovalFlow } from '@/lib/services/useServiceRemovalFlow';
import type { ServiceRemovalAffectedBooking } from '@/lib/services/service-removal';

function booking(id: string, over: Partial<ServiceRemovalAffectedBooking> = {}) {
  return {
    id,
    service_id: 'svc-1',
    service_name: 'Cut and finish',
    calendar_id: 'cal-1',
    calendar_name: 'Chair 1',
    booking_date: '2026-10-14',
    booking_time: '10:00',
    end_time: '11:00',
    guest_name: 'Alex Smith',
    party_size: 1,
    status: 'Booked',
    ...over,
  };
}

function confirmation409(bookings: ReturnType<typeof booking>[]): ApiError {
  return new ApiError('Request failed (409)', 409, {
    requires_confirmation: true,
    message: 'These bookings are already in the diary.',
    error: 'These bookings are already in the diary.',
    affected_bookings: bookings,
    affected_total: bookings.length,
    affected_truncated: false,
  });
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('useServiceRemovalFlow', () => {
  it('passes a clean save straight through', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest.fn().mockResolvedValue(undefined);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.start(save);
    });

    expect(outcome).toBe('saved');
    expect(save).toHaveBeenCalledWith(false);
    expect(result.current.confirmation).toBeNull();
  });

  it('holds the save and surfaces the affected bookings on the 409', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest.fn().mockRejectedValue(confirmation409([booking('b1'), booking('b2')]));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.start(save);
    });

    expect(outcome).toBe('needs_confirmation');
    expect(result.current.confirmation?.bookings).toHaveLength(2);
    expect(result.current.confirmation?.message).toBe('These bookings are already in the diary.');
    // Nothing saved yet: the ask is the whole point.
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(false);
  });

  it('rethrows any other failure, so a plain refusal is still a refusal', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest.fn().mockRejectedValue(new ApiError('Nope', 409, { error: 'Nope' }));

    await act(async () => {
      await expect(result.current.start(save)).rejects.toThrow('Nope');
    });
    expect(result.current.confirmation).toBeNull();
  });

  it('re-sends the SAME save acknowledged when the bookings are left where they are', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest
      .fn()
      .mockRejectedValueOnce(confirmation409([booking('b1')]))
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.start(save);
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.confirm([]);
    });

    expect(outcome).toBe('saved');
    expect(save).toHaveBeenNthCalledWith(2, true);
    expect(mockApiFetch).not.toHaveBeenCalled(); // nothing was moved
    expect(result.current.confirmation).toBeNull();
  });

  it('moves the chosen bookings first, keeping date, time and length, then saves', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest
      .fn()
      .mockRejectedValueOnce(confirmation409([booking('b1')]))
      .mockResolvedValueOnce(undefined);
    mockApiFetch.mockResolvedValue({ id: 'b1' });

    await act(async () => {
      await result.current.start(save);
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.confirm([{ bookingId: 'b1', targetCalendarId: 'cal-9' }]);
    });

    expect(outcome).toBe('saved');
    const [path, options] = mockApiFetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(path).toBe('/api/venue/bookings/b1');
    expect(options.method).toBe('PATCH');
    const body = JSON.parse(options.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      practitioner_id: 'cal-9',
      booking_date: '2026-10-14',
      booking_time: '10:00',
      booking_end_time: '11:00:00',
      skip_booking_modification_guest_notification: true,
      // The booking already exists at this time, so the target's hours and
      // breaks are not a reason to refuse it...
      allow_outside_hours: true,
      allow_during_breaks: true,
      // ...but a real clash with another guest still is.
      allow_manual_overlap: false,
    });
    // The move comes first, the acknowledged save second.
    expect(save).toHaveBeenNthCalledWith(2, true);
  });

  it('a failed move keeps the panel open on what is left and does NOT save', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest.fn().mockRejectedValueOnce(confirmation409([booking('b1'), booking('b2')]));
    mockApiFetch
      .mockResolvedValueOnce({ id: 'b1' })
      .mockRejectedValueOnce(new ApiError('That time is already booked', 409, {}));

    await act(async () => {
      await result.current.start(save);
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.confirm([
        { bookingId: 'b1', targetCalendarId: 'cal-9' },
        { bookingId: 'b2', targetCalendarId: 'cal-9' },
      ]);
    });

    expect(outcome).toBe('move_failed');
    expect(save).toHaveBeenCalledTimes(1); // still only the first, refused attempt
    expect(result.current.failures).toHaveLength(1);
    expect(result.current.failures[0]!.reason).toBe('That time is already booked');
    // b1 moved, so it is gone from the list a second attempt would act on.
    expect(result.current.confirmation?.bookings.map((b) => b.id)).toEqual(['b2']);
    expect(result.current.confirmation?.total).toBe(1);
  });

  it('cancel drops the pending save', async () => {
    const { result } = await renderHook(() => useServiceRemovalFlow(), { wrapper: makeWrapper() });
    const save = jest.fn().mockRejectedValue(confirmation409([booking('b1')]));

    await act(async () => {
      await result.current.start(save);
    });
    await act(async () => {
      result.current.cancel();
    });

    expect(result.current.confirmation).toBeNull();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.confirm([]);
    });
    expect(outcome).toBe('error');
    expect(save).toHaveBeenCalledTimes(1);
  });
});
