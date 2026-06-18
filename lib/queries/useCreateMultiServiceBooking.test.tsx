/**
 * Mock-mutation tests for the grouped-booking create hooks. Pins the request
 * contract against C:\Resneo/src/app/api/booking/create-multi-service and
 * /create-group (the public endpoints the web staff flow posts to).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useCreateGroupBooking } from '@/lib/queries/useCreateGroupBooking';
import { useCreateMultiServiceBooking } from '@/lib/queries/useCreateMultiServiceBooking';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

describe('useCreateMultiServiceBooking', () => {
  it('POSTs the chained payload to /api/booking/create-multi-service', async () => {
    mockApiFetch.mockResolvedValueOnce({
      group_booking_id: 'grp-1',
      booking_ids: ['b1', 'b2'],
      primary_booking_id: 'b1',
      requires_deposit: false,
      total_deposit_pence: 0,
      status: 'Booked',
    });
    const { result } = await renderHook(() => useCreateMultiServiceBooking(), {
      wrapper: makeWrapper(),
    });
    const payload = {
      venue_id: 'venue-1',
      booking_date: '2026-06-20',
      first_name: 'Jo',
      last_name: 'B',
      source: 'phone' as const,
      services: [
        { service_id: 'a', practitioner_id: 'p', start_time: '09:00' },
        { service_id: 'b', practitioner_id: 'p', start_time: '09:30' },
      ],
    };
    const res = await result.current.mutateAsync(payload);
    expect(res.primary_booking_id).toBe('b1');
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/booking/create-multi-service');
    expect((opts as { method: string }).method).toBe('POST');
    expect((opts as { accessToken: string }).accessToken).toBe(mockToken);
    expect(JSON.parse((opts as { body: string }).body)).toEqual(payload);
  });

  it('surfaces the Stripe extension fields when a deposit is owed', async () => {
    mockApiFetch.mockResolvedValueOnce({
      group_booking_id: 'grp-1',
      booking_ids: ['b1'],
      primary_booking_id: 'b1',
      requires_deposit: true,
      total_deposit_pence: 2500,
      client_secret: 'pi_secret',
      stripe_account_id: 'acct_123',
      status: 'Pending',
    });
    const { result } = await renderHook(() => useCreateMultiServiceBooking(), {
      wrapper: makeWrapper(),
    });
    const res = await result.current.mutateAsync({
      venue_id: 'v',
      booking_date: '2026-06-20',
      first_name: 'Jo',
      last_name: 'B',
      source: 'phone',
      services: [{ service_id: 'a', practitioner_id: 'p', start_time: '09:00' }],
    });
    expect(res.requires_deposit).toBe(true);
    expect(res.client_secret).toBe('pi_secret');
    expect(res.stripe_account_id).toBe('acct_123');
  });
});

describe('useCreateGroupBooking', () => {
  it('POSTs the people payload to /api/booking/create-group', async () => {
    mockApiFetch.mockResolvedValueOnce({
      group_booking_id: 'grp-2',
      booking_ids: ['b1', 'b2'],
      requires_deposit: false,
      total_deposit_pence: 0,
      status: 'Booked',
    });
    const { result } = await renderHook(() => useCreateGroupBooking(), { wrapper: makeWrapper() });
    const payload = {
      venue_id: 'venue-1',
      first_name: 'Org',
      last_name: 'A',
      source: 'phone' as const,
      people: [
        { person_label: 'Alex', practitioner_id: 'p', appointment_service_id: 's1', booking_date: '2026-06-20', booking_time: '09:00' },
        { person_label: 'Sam', practitioner_id: 'p2', appointment_service_id: 's2', booking_date: '2026-06-20', booking_time: '09:30' },
      ],
    };
    const res = await result.current.mutateAsync(payload);
    expect(res.booking_ids).toEqual(['b1', 'b2']);
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/booking/create-group');
    expect((opts as { method: string }).method).toBe('POST');
    expect(JSON.parse((opts as { body: string }).body)).toEqual(payload);
  });
});
