import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  BOOKING_ACTIVITY_PAGE,
  type BookingActivityFilter,
  type BookingActivityResponse,
} from '@/types/booking-activity';

/**
 * One page of the list, or null when the server has no such route (a web deploy from before the
 * booking activity plan answers 404). Null hides the bell's Bookings tab (plan section 4).
 */
export type BookingActivityPage = BookingActivityResponse | null;

/** The request path for one page. `before` is the previous page's `next_before`. */
export function bookingActivityPath(params: {
  kind: BookingActivityFilter;
  mine: boolean;
  before?: string | null;
}): string {
  const query = new URLSearchParams();
  if (params.before) query.set('before', params.before);
  query.set('kind', params.kind);
  query.set('mine', params.mine ? '1' : '0');
  query.set('limit', String(BOOKING_ACTIVITY_PAGE));
  return `/api/venue/booking-activity?${query.toString()}`;
}

/** Fills anything an answer leaves out, so one odd row never breaks the list. */
function normalise(body: Partial<BookingActivityResponse> | null | undefined): BookingActivityResponse {
  return {
    items: Array.isArray(body?.items) ? body.items : [],
    next_before: typeof body?.next_before === 'string' && body.next_before ? body.next_before : null,
    has_calendars: body?.has_calendars === true,
    only_mine: body?.only_mine === true,
  };
}

/**
 * GET /api/venue/booking-activity: new bookings, cancellations and moves, newest first, 50 at a
 * time, paged by `next_before` (Bearer). `kind` is the filter chip; `mine` is "Just my clients".
 *
 * `unavailable` is true when the server answered 404 for the first page: an older web deploy.
 */
export function useBookingActivity(params: { kind: BookingActivityFilter; mine: boolean }) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;
  const { kind, mine } = params;

  const query = useInfiniteQuery({
    queryKey: queryKeys.bookingActivity.list(accessToken, kind, mine),
    enabled,
    // Keep the last answer while another filter loads, so "Just my clients" (read from the answer)
    // does not blink out. The screen shows its skeleton, not the old rows, meanwhile.
    placeholderData: keepPreviousData,
    initialPageParam: null as string | null,
    getNextPageParam: (last: BookingActivityPage) => last?.next_before ?? undefined,
    queryFn: async ({ pageParam }): Promise<BookingActivityPage> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        const body = await apiFetch<Partial<BookingActivityResponse>>(
          bookingActivityPath({ kind, mine, before: pageParam }),
          { accessToken },
        );
        return normalise(body);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

  const pages = query.data?.pages;
  const unavailable = pages !== undefined && pages.length > 0 && pages[0] === null;
  const first = pages?.[0] ?? null;
  const items = useMemo(() => (pages ?? []).flatMap((page) => page?.items ?? []), [pages]);

  return {
    query,
    unavailable,
    items,
    hasCalendars: first?.has_calendars ?? false,
    onlyMine: first?.only_mine ?? false,
  };
}
