import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { newBookingsQuery, type NewBookingsRangeChoice } from '@/lib/reports/new-bookings';
import type { NewBookingsGrain, NewBookingsReport } from '@/types/reports';

/**
 * GET /api/venue/reports/new-bookings (web 2026-09-18, admin only): bookings made per day, week
 * or month in the range, split by channel. Keyed on the resolved query string, as the revenue
 * report is, and the previous answer stays on screen while the next loads.
 */
export function useNewBookings(choice: NewBookingsRangeChoice, grain: NewBookingsGrain, enabled = true) {
  const accessToken = useAccessToken();
  const query = newBookingsQuery(choice, grain);
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.newBookings(accessToken, query),
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<NewBookingsReport> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<NewBookingsReport>(`/api/venue/reports/new-bookings?${query}`, { accessToken });
    },
  });
}
