/**
 * useJoinWaitlist — the widened add-to-waitlist input (Waitlist domain 09 medium).
 *
 * Pins the request body against the web `joinSchema` in
 * C:\Resneo/src/app/api/booking/appointment-waitlist/route.ts:
 *  - default window is `all_day` and sends NO desired_time(_end)
 *  - `time_range` sends both times
 *  - notes is trimmed and omitted when blank
 *  - practitioner_id is omitted when absent
 *
 * jest hoists mock factories above imports, so every closed-over variable is
 * prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { buildJoinWaitlistBody, useJoinWaitlist } from '@/lib/queries/useJoinWaitlist';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const base = {
  venue_id: 'venue-1',
  service_id: 'svc-1',
  desired_date: '2026-06-20',
  first_name: 'Jo',
  last_name: 'Bloggs',
  guest_email: 'jo@example.com',
  guest_phone: '07123456789',
};

describe('buildJoinWaitlistBody', () => {
  it('defaults to all_day and never sends times', () => {
    const body = buildJoinWaitlistBody({ ...base });
    expect(body.preferred_window).toBe('all_day');
    expect(body).not.toHaveProperty('desired_time');
    expect(body).not.toHaveProperty('desired_time_end');
    expect(body).not.toHaveProperty('notes');
    expect(body).not.toHaveProperty('practitioner_id');
  });

  it('drops times when window is all_day even if they are passed', () => {
    const body = buildJoinWaitlistBody({
      ...base,
      preferred_window: 'all_day',
      desired_time: '09:00',
      desired_time_end: '12:00',
    });
    expect(body).not.toHaveProperty('desired_time');
    expect(body).not.toHaveProperty('desired_time_end');
  });

  it('sends both times for a time_range window', () => {
    const body = buildJoinWaitlistBody({
      ...base,
      preferred_window: 'time_range',
      desired_time: '09:00',
      desired_time_end: '12:00',
    });
    expect(body.preferred_window).toBe('time_range');
    expect(body.desired_time).toBe('09:00');
    expect(body.desired_time_end).toBe('12:00');
  });

  it('trims notes and omits them when blank', () => {
    expect(buildJoinWaitlistBody({ ...base, notes: '  please call first  ' }).notes).toBe(
      'please call first',
    );
    expect(buildJoinWaitlistBody({ ...base, notes: '   ' })).not.toHaveProperty('notes');
  });

  it('includes practitioner_id only when provided', () => {
    expect(buildJoinWaitlistBody({ ...base, practitioner_id: 'p1' }).practitioner_id).toBe('p1');
    expect(buildJoinWaitlistBody({ ...base })).not.toHaveProperty('practitioner_id');
  });
});

describe('useJoinWaitlist', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('POSTs the built body to the public appointment-waitlist endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce({ waitlist_id: 'w1' });
    const { result } = await renderHook(() => useJoinWaitlist(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({
      ...base,
      practitioner_id: 'p1',
      preferred_window: 'time_range',
      desired_time: '09:00',
      desired_time_end: '12:00',
      notes: 'window seat',
    });

    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/booking/appointment-waitlist');
    expect((opts as { method: string }).method).toBe('POST');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      venue_id: 'venue-1',
      service_id: 'svc-1',
      desired_date: '2026-06-20',
      first_name: 'Jo',
      last_name: 'Bloggs',
      guest_email: 'jo@example.com',
      guest_phone: '07123456789',
      preferred_window: 'time_range',
      practitioner_id: 'p1',
      desired_time: '09:00',
      desired_time_end: '12:00',
      notes: 'window seat',
    });
  });
});
