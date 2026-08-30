/**
 * C2: the times offered when moving a booking.
 *
 * This is the one call in the customer flow that reaches outside the customer
 * surface, to the public availability endpoint, because availability belongs to
 * the venue rather than the caller. What it does with the answer is the part
 * worth pinning: the engine replies per practitioner, and showing all of it
 * would offer a customer times with somebody they did not book.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRescheduleSlots } = require('./useRescheduleSlots') as typeof import('./useRescheduleSlots');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const slot = (start: string, practitionerId = 'pr-1') => ({
  practitioner_id: practitionerId,
  practitioner_name: 'Alex',
  service_id: 'svc-1',
  service_name: 'Cut',
  start_time: start,
  duration_minutes: 30,
  price_pence: 2500,
});

const ARGS = {
  venueId: 'v-1',
  date: '2026-09-01',
  serviceId: 'svc-1',
  practitionerId: 'pr-1',
};

beforeEach(() => mockApiFetch.mockReset());

describe('what it asks for', () => {
  it('asks the PUBLIC availability endpoint, with no access token', async () => {
    /*
      Availability does not vary by who is asking, and the route does not want a
      credential. Sending one anyway would just widen where the token has been.
    */
    mockApiFetch.mockResolvedValue({ practitioners: [] });
    await renderHook(() => useRescheduleSlots(ARGS), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(String(path)).toContain('/api/booking/availability');
    expect(String(path)).toContain('booking_model=appointment');
    expect(String(path)).toContain('service_id=svc-1');
    expect(opts).toBeUndefined();
  });

  it('asks for nothing without a service, which the engine requires', async () => {
    await renderHook(() => useRescheduleSlots({ ...ARGS, serviceId: null }), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('asks for nothing while the sheet is closed and no date is set', async () => {
    await renderHook(() => useRescheduleSlots({ ...ARGS, date: null }), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('what it does with the answer', () => {
  it('offers only the booking’s own practitioner', async () => {
    /*
      The engine answers for everyone who could do this service, because the
      public booking page lets you choose. A reschedule is not that: moving to a
      slot with a different practitioner is a different appointment, and
      offering it under "change my booking" is a surprise rather than a
      convenience.
    */
    mockApiFetch.mockResolvedValue({
      practitioners: [
        { id: 'pr-1', name: 'Alex', slots: [slot('10:00')] },
        { id: 'pr-2', name: 'Sam', slots: [slot('11:00', 'pr-2')] },
      ],
    });
    const { result } = await renderHook(() => useRescheduleSlots(ARGS), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((s) => s.start_time)).toEqual(['10:00']);
  });

  it('keeps every practitioner when the booking names none', async () => {
    // An "any available" booking has no practitioner to be loyal to.
    mockApiFetch.mockResolvedValue({
      practitioners: [
        { id: 'pr-1', name: 'Alex', slots: [slot('10:00')] },
        { id: 'pr-2', name: 'Sam', slots: [slot('11:00', 'pr-2')] },
      ],
    });
    const { result } = await renderHook(
      () => useRescheduleSlots({ ...ARGS, practitionerId: null }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(2);
  });

  it('shows each start time once', async () => {
    /*
      A service offered under more than one variant produces several slots at
      the same minute. A picker listing "10:00" three times looks broken, and
      the three are not different choices to the customer.
    */
    mockApiFetch.mockResolvedValue({
      practitioners: [{ id: 'pr-1', name: 'Alex', slots: [slot('10:00'), slot('10:00'), slot('11:00')] }],
    });
    const { result } = await renderHook(() => useRescheduleSlots(ARGS), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((s) => s.start_time)).toEqual(['10:00', '11:00']);
  });

  it('puts the day in order', async () => {
    // The engine merges several practitioners, so its order is not the day's.
    mockApiFetch.mockResolvedValue({
      practitioners: [{ id: 'pr-1', name: 'Alex', slots: [slot('16:00'), slot('09:30'), slot('12:15')] }],
    });
    const { result } = await renderHook(() => useRescheduleSlots(ARGS), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((s) => s.start_time)).toEqual(['09:30', '12:15', '16:00']);
  });

  it('treats a day with no practitioners as no times, not as a crash', async () => {
    // A closed day answers with nothing, and the screen says "nothing free".
    mockApiFetch.mockResolvedValue({ date: '2026-09-01', venue_id: 'v-1' });
    const { result } = await renderHook(() => useRescheduleSlots(ARGS), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([]);
  });
});
