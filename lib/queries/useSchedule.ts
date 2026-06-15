import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { ScheduleBlockDTO, ScheduleBlocksResponse } from '@/types/schedule-blocks';

type UseScheduleOptions = {
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** Inclusive range end (YYYY-MM-DD). */
  to: string;
  enabled?: boolean;
  /**
   * Poll interval (ms) for near-realtime parity — mirrors useCalendarGrid so the
   * schedule feed (classes/events/resources) refreshes on the same cadence as
   * the grid. Omit to disable polling.
   */
  refetchInterval?: number;
};

/**
 * Loads the venue-wide CLASS / EVENT / RESOURCE schedule blocks for the given
 * date range from GET /api/venue/schedule (Bearer-capable). Returns a FLAT
 * ScheduleBlockDTO[] for the WHOLE venue — NOT filtered by calendar id — so the
 * caller groups by `calendar_id` to attach blocks to the right column.
 *
 * This feed is disjoint from the calendar-grid's `sessions` by design (the web
 * draws the calendar's class/event capacity blocks from here), so rendering
 * both never double-counts.
 */
export function useSchedule(options: UseScheduleOptions) {
  const accessToken = useAccessToken();
  const { from, to } = options;
  const queryEnabled =
    (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.schedule.range(accessToken, from, to),
    enabled: queryEnabled,
    // Only poll while the query is enabled (an active calendar/range).
    refetchInterval: options.refetchInterval,
    queryFn: async (): Promise<ScheduleBlockDTO[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to });
      const data = await apiFetch<ScheduleBlocksResponse>(`/api/venue/schedule?${params}`, {
        accessToken,
      });
      return data.blocks ?? [];
    },
  });
}
