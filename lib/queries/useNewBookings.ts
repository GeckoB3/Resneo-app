import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { newBookingsQuery, type NewBookingsRangeChoice } from '@/lib/reports/new-bookings';
import { scopeRetryOption, withScopeParams, type ReportScopeQuery } from '@/lib/reports/report-scope';
import type { NewBookingsGrain, NewBookingsReport } from '@/types/reports';

/**
 * GET /api/venue/reports/new-bookings (web 2026-09-18, admin only): bookings made per day, week
 * or month in the range, split by channel. Keyed on the resolved query string, as the revenue
 * report is, and the previous answer stays on screen while the next loads. `scope` is what the
 * Showing picker chose (`calendar_id`, `business`, `compare`; lib/reports/report-scope.ts), or a bare
 * calendar id as before release 1; it is in the query string, and so in the key.
 */
export function useNewBookings(
  choice: NewBookingsRangeChoice,
  grain: NewBookingsGrain,
  enabled = true,
  scope: ReportScopeQuery | string | null = null,
) {
  const accessToken = useAccessToken();
  const query = withScopeParams(newBookingsQuery(choice, grain), scope);
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.newBookings(accessToken, query),
    enabled: queryEnabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    ...scopeRetryOption(scope),
    queryFn: async (): Promise<NewBookingsReport> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<NewBookingsReport>(`/api/venue/reports/new-bookings?${query}`, { accessToken });
    },
  });
}
