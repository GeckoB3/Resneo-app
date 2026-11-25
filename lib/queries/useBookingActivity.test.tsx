/**
 * The bell's Bookings list on the wire (web booking-activity plan, BA2): the first page asks with no
 * `before`, the next asks with the previous page's `next_before`, the filter and "Just my clients"
 * travel as `kind` and `mine`, and a server without the route (404, an older web deploy) makes the
 * feature unavailable rather than an error.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { ApiError } from '@/lib/api/client';
import { bookingActivityPath, useBookingActivity } from '@/lib/queries/useBookingActivity';
import type { BookingActivityItem } from '@/types/booking-activity';

function row(id: string): BookingActivityItem {
  return {
    id,
    kind: 'new',
    at: '2026-11-25T10:42:00.000Z',
    at_label: 'Today 10:42am',
    booking_id: `b-${id}`,
    client_name: 'Sam Client',
    text: 'Booked Cut with Jenny Ross for Tue 9 Dec, 2:30pm',
    by_label: 'Online',
    state: null,
  };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}

/**
 * The hook, reading what the tests look at during render. React Query only re-renders for the
 * fields a render read (tracked properties), as the screen does.
 */
function useProbe(params: Parameters<typeof useBookingActivity>[0]) {
  const activity = useBookingActivity(params);
  return {
    ...activity,
    isError: activity.query.isError,
    isSuccess: activity.query.isSuccess,
    hasNextPage: activity.query.hasNextPage,
  };
}

function paths(): string[] {
  return mockApiFetch.mock.calls.map((call) => call[0] as string);
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('bookingActivityPath', () => {
  it('sends the filter, "Just my clients" and the page size, and before only when paging', () => {
    expect(bookingActivityPath({ kind: 'all', mine: false })).toBe(
      '/api/venue/booking-activity?kind=all&mine=0&limit=50',
    );
    expect(
      bookingActivityPath({ kind: 'cancelled', mine: true, before: '2026-11-20T09:00:00.000Z' }),
    ).toBe(
      '/api/venue/booking-activity?before=2026-11-20T09%3A00%3A00.000Z&kind=cancelled&mine=1&limit=50',
    );
  });
});

describe('useBookingActivity', () => {
  it('pages with before = the last page next_before, and stops when it is null', async () => {
    mockApiFetch.mockImplementation(async (path: string) =>
      path.includes('before=')
        ? { items: [row('2')], next_before: null, has_calendars: true, only_mine: false }
        : {
            items: [row('1')],
            next_before: '2026-11-20T09:00:00.000Z',
            has_calendars: true,
            only_mine: false,
          },
    );
    const { wrapper } = setup();
    const { result } = await renderHook(() => useProbe({ kind: 'moved', mine: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(paths()[0]).toBe('/api/venue/booking-activity?kind=moved&mine=1&limit=50');
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasCalendars).toBe(true);
    expect(result.current.onlyMine).toBe(false);
    expect(result.current.unavailable).toBe(false);

    await act(async () => {
      await result.current.query.fetchNextPage();
    });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['1', '2']));
    expect(paths()[1]).toBe(
      '/api/venue/booking-activity?before=2026-11-20T09%3A00%3A00.000Z&kind=moved&mine=1&limit=50',
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it('a 404 (an older web deploy) makes the feature unavailable, not an error', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Not found', 404));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useProbe({ kind: 'all', mine: false }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('any other failure is an error, and the feature stays available', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Something went wrong', 500));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useProbe({ kind: 'all', mine: false }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.unavailable).toBe(false);
  });

  it('fills a sparse answer so the list never breaks', async () => {
    mockApiFetch.mockResolvedValue({});
    const { wrapper } = setup();
    const { result } = await renderHook(() => useProbe({ kind: 'all', mine: false }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.hasCalendars).toBe(false);
    expect(result.current.onlyMine).toBe(false);
    expect(result.current.hasNextPage).toBe(false);
  });
});
