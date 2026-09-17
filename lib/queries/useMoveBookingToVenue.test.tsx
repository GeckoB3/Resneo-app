/**
 * The diary's one-step move to another venue of the collective (web D46): the request it sends, and
 * that the refusal reaches the caller as the server wrote it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// eslint-disable-next-line import/first
import { ApiError } from '@/lib/api/client';
// eslint-disable-next-line import/first
import { useMoveBookingToVenue } from '@/lib/queries/useMoveBookingToVenue';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => mockApiFetch.mockReset());

describe('useMoveBookingToVenue', () => {
  it('posts the calendar, date and time to the move route', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      booking_id: 'b-new',
      venue_id: 'v-2',
      venue_name: 'Zen Studio',
      guest_notified: true,
    });
    const { result } = await renderHook(() => useMoveBookingToVenue(), { wrapper });
    const moved = await result.current.mutateAsync({
      bookingId: 'b-1',
      calendarId: 'cal-9',
      bookingDate: '2026-09-24',
      bookingTime: '14:00:00',
    });
    expect(moved.venue_name).toBe('Zen Studio');
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/bookings/b-1/move-venue');
    expect((opts as { method: string }).method).toBe('POST');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      calendar_id: 'cal-9',
      booking_date: '2026-09-24',
      booking_time: '14:00',
    });
  });

  it('hands the server’s refusal back as it is', async () => {
    const sentence = 'This booking has a deposit, card hold or payment, so it stays with the venue that took it.';
    mockApiFetch.mockRejectedValueOnce(new ApiError(sentence, 409, { error: sentence, code: 'COLLECTIVE_MOVE_ATTACHED' }));
    const { result } = await renderHook(() => useMoveBookingToVenue(), { wrapper });
    await expect(
      result.current.mutateAsync({ bookingId: 'b-1', calendarId: 'cal-9', bookingDate: '2026-09-24', bookingTime: '14:00' }),
    ).rejects.toThrow(sentence);
  });
});
