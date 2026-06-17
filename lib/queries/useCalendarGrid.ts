import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { CalendarGridResponse } from '@/types/calendar-grid';

type UseCalendarGridOptions = {
  /** Calendar/practitioner column ids to fetch. */
  calendarIds: string[];
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** Inclusive range end (YYYY-MM-DD). */
  to: string;
  enabled?: boolean;
  /**
   * Poll interval (ms) for near-realtime parity — a second device's changes
   * surface without a manual refresh. Omit to disable polling.
   */
  refetchInterval?: number;
};

/**
 * Loads bookings + blocks + sessions for the given calendars/date range from
 * GET /api/venue/calendar-grid (the source for the calendar grid view).
 */
export function useCalendarGrid(options: UseCalendarGridOptions) {
  const accessToken = useAccessToken();
  const calendarIds = options.calendarIds.join(',');
  const { from, to } = options;
  const queryEnabled =
    (options.enabled ?? true) &&
    isBackendConfigured() &&
    accessToken !== null &&
    calendarIds.length > 0;

  return useQuery({
    queryKey: queryKeys.calendar.grid(accessToken, calendarIds, from, to),
    enabled: queryEnabled,
    // Keep the prior day/range on screen while the next loads — stepping the
    // calendar date dims rather than flashing a full skeleton.
    placeholderData: keepPreviousData,
    // Only poll while the query is enabled (an active calendar/range).
    refetchInterval: options.refetchInterval,
    queryFn: async (): Promise<CalendarGridResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({
        calendar_ids: calendarIds,
        start_date: from,
        end_date: to,
      });
      return apiFetch<CalendarGridResponse>(`/api/venue/calendar-grid?${params}`, {
        accessToken,
      });
    },
  });
}
