/**
 * E-5 (web 2026-09-23): booking for a live collective, classes and events come
 * from the STAFF routes with `owner_venue_id` = the collective, as the web staff
 * flow reads them (`booking-flow-api.ts`). Those add this venue's own classes and
 * events that are not listed on the combined page; the public combined page
 * leaves them out, so nobody could book them while the collective was live.
 * Everything else keeps reading the public route.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

let mockToken: string | null = 'token-A';
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

import {
  staffCollectiveOfferingsPath,
  useClassOfferings,
  useEventOfferings,
} from '@/lib/queries/useBookableOfferings';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const EMPTY = { venue_id: 'x', from: '', to: '', classes: [], events: [], instances: [] };

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(EMPTY);
  mockToken = 'token-A';
});

describe('staffCollectiveOfferingsPath', () => {
  it("matches the web staff flow's params", () => {
    expect(staffCollectiveOfferingsPath('class', 'col-1', '2030-01-01', 90)).toBe(
      '/api/venue/class-offerings?from=2030-01-01&days=90&owner_venue_id=col-1',
    );
    expect(staffCollectiveOfferingsPath('event', 'col-1', null, 90)).toBe(
      '/api/venue/event-offerings?days=90&owner_venue_id=col-1',
    );
  });
});

describe('useClassOfferings / useEventOfferings route choice (E-5)', () => {
  it('reads the staff class route with the Bearer token for a collective', async () => {
    const { result } = await renderHook(
      () => useClassOfferings('col-1', { from: '2030-01-01', staffCollectiveId: 'col-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/class-offerings?from=2030-01-01&days=90&owner_venue_id=col-1');
    expect((opts as { accessToken?: string }).accessToken).toBe('token-A');
  });

  it('reads the staff event route for a collective', async () => {
    const { result } = await renderHook(
      () => useEventOfferings('col-1', { from: '2030-01-01', staffCollectiveId: 'col-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch.mock.calls[0]![0]).toBe(
      '/api/venue/event-offerings?from=2030-01-01&days=90&owner_venue_id=col-1',
    );
  });

  it('waits for a signed-in staff member before reading the staff route', async () => {
    mockToken = null;
    const { result } = await renderHook(
      () => useClassOfferings('col-1', { from: '2030-01-01', staffCollectiveId: 'col-1' }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('keeps the public routes outside a collective', async () => {
    const classes = await renderHook(() => useClassOfferings('venue-1', { from: '2030-01-01' }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(classes.result.current.isSuccess).toBe(true));
    const events = await renderHook(
      () => useEventOfferings('venue-1', { from: '2030-01-01', staffCollectiveId: null }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(events.result.current.isSuccess).toBe(true));

    expect(mockApiFetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/booking/class-offerings?venue_id=venue-1&days=90&from=2030-01-01',
      '/api/booking/event-offerings?venue_id=venue-1&days=90&from=2030-01-01',
    ]);
  });
});
