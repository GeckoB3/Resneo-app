import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { DaySheetResponse } from '@/types/day-sheet';

/**
 * Loads the day-sheet run-sheet for a given date (period-grouped bookings + summary).
 * GET /api/venue/day-sheet?date=YYYY-MM-DD (Bearer).
 */
export function useDaySheet(date: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(date);

  return useQuery({
    queryKey: queryKeys.daySheet.byDate(accessToken, date),
    enabled,
    queryFn: async (): Promise<DaySheetResponse> => {
      if (!accessToken || !date) {
        throw new Error('Missing day-sheet parameters');
      }
      return apiFetch<DaySheetResponse>(`/api/venue/day-sheet?date=${date}`, { accessToken });
    },
  });
}
