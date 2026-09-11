import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { bookedRevenueQuery, type BookedRevenueRangeChoice } from '@/lib/reports/booked-revenue';
import type { BookedRevenueGrain, BookedRevenueReport } from '@/types/reports';

/**
 * GET /api/venue/reports/booked-revenue (web #191, admin only, Bearer):
 * booked revenue per period and per calendar, linked venues' calendars
 * included on a full-detail create/edit/cancel grant. A preset is resolved
 * server-side from the venue's own today, so "This week" is the diary's week.
 * The previous answer stays on screen while the next range loads.
 */
export function useBookedRevenue(
  choice: BookedRevenueRangeChoice,
  grain: BookedRevenueGrain,
  enabled = true,
) {
  const accessToken = useAccessToken();
  const query = bookedRevenueQuery(choice, grain);
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.bookedRevenue(accessToken, query),
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<BookedRevenueReport> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookedRevenueReport>(`/api/venue/reports/booked-revenue?${query}`, {
        accessToken,
      });
    },
  });
}
