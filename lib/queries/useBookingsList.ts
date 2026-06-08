import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingsListResponse } from '@/types/booking-list';

const DEFAULT_TIMEZONE = 'Europe/London';

/**
 * Returns today's calendar date (YYYY-MM-DD) in the given IANA timezone.
 * Uses Intl so we avoid extra timezone dependencies — venue tz can replace the default later.
 */
export function calendarDateInTimeZone(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

type UseBookingsListOptions = {
  /** YYYY-MM-DD — defaults to today in Europe/London (or pass venue timezone). */
  date?: string;
  /** When false, the query does not run (e.g. while dashboard recent_bookings is enough). */
  enabled?: boolean;
  timeZone?: string;
};

/**
 * Loads bookings for a single day from GET /api/venue/bookings/list.
 * Disabled until backend env vars, a Supabase session, and `enabled` are true.
 */
export function useBookingsList(options: UseBookingsListOptions = {}) {
  const accessToken = useAccessToken();
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
  const date = options.date ?? calendarDateInTimeZone(new Date(), timeZone);
  const queryEnabled =
    (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.bookings.list(accessToken, date),
    enabled: queryEnabled,
    queryFn: async (): Promise<BookingsListResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ date });
      return apiFetch<BookingsListResponse>(`/api/venue/bookings/list?${params}`, {
        accessToken,
      });
    },
  });
}
