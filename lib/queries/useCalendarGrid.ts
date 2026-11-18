import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

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
   *
   * `false` pauses it without unmounting the query: the calendar holds the poll
   * while a quick action or drag is in flight, so a read started mid-write cannot
   * put the pre-write status back over the optimistic patch.
   */
  refetchInterval?: number | false;
  /**
   * Card on file (plan §6.1): bookings waiting for a card, read from the list route because the
   * grid route does not say. Each is marked `card_state: 'waiting'` so its bar shows the pill.
   */
  waitingForCardIds?: ReadonlySet<string> | null;
};

/**
 * Loads bookings + blocks + sessions for the given calendars/date range from
 * GET /api/venue/calendar-grid (the source for the calendar grid view).
 */
export function useCalendarGrid(options: UseCalendarGridOptions) {
  const accessToken = useAccessToken();
  const calendarIds = options.calendarIds.join(',');
  const { from, to } = options;
  const waiting = options.waitingForCardIds ?? null;
  const select = useCallback(
    (data: CalendarGridResponse) => markWaitingForCard(data, waiting),
    [waiting],
  );
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
    select,
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

/**
 * Mark the grid's bookings that wait for a card (`card_state: 'waiting'`). The response is
 * returned as it is when there is nothing to mark, so the grid keeps its identity.
 */
export function markWaitingForCard(
  data: CalendarGridResponse,
  waiting: ReadonlySet<string> | null,
): CalendarGridResponse {
  if (!waiting || waiting.size === 0) return data;
  let changed = false;
  const calendars = data.calendars.map((cal) => ({
    ...cal,
    dates: cal.dates.map((day) => ({
      ...day,
      bookings: day.bookings.map((b) => {
        if (!waiting.has(b.id) || b.card_state === 'waiting') return b;
        changed = true;
        return { ...b, card_state: 'waiting' as const };
      }),
    })),
  }));
  return changed ? { ...data, calendars } : data;
}
