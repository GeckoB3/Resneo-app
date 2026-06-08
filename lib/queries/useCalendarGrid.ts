import { useQuery } from '@tanstack/react-query';

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
