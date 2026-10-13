import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { bookedRevenueQuery, type BookedRevenueRangeChoice } from '@/lib/reports/booked-revenue';
import { scopeRetryOption, type ReportScopeQuery } from '@/lib/reports/report-scope';
import type { BookedRevenueGrain, BookedRevenueReport } from '@/types/reports';

/**
 * GET /api/venue/reports/booked-revenue (web #191, admin only, Bearer):
 * booked revenue per period and per calendar, with each venue subtotalled:
 * linked venues' calendars on a full-detail create/edit/cancel grant, and every
 * member of a live collective. A preset is resolved server-side from the
 * venue's own today, so "This week" is the diary's week. The previous answer
 * stays on screen while the next range loads.
 *
 * `scope` is what the Showing picker chose (`calendar_id`, `business`,
 * `compare`; lib/reports/report-scope.ts), or a bare calendar id as before
 * release 1. Since release 1 the default is your own venue only; `business=all`
 * adds every partner. It is in the query string, so it is in the key too.
 */
export function useBookedRevenue(
  choice: BookedRevenueRangeChoice,
  grain: BookedRevenueGrain,
  enabled = true,
  scope: ReportScopeQuery | string | null = null,
) {
  const accessToken = useAccessToken();
  const query = bookedRevenueQuery(choice, grain, scope);
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.bookedRevenue(accessToken, query),
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    ...scopeRetryOption(scope),
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
