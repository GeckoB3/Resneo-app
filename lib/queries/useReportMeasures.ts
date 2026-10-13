import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { normaliseScopeQuery, scopeRetryOption, withScopeParams, type ReportScopeQuery } from '@/lib/reports/report-scope';
import type { SalonMeasuresReport } from '@/types/reports';

/**
 * GET /api/venue/reports/measures?from=&to=: the salon measures and the Team tab (reports plan,
 * release 2; admin only, Bearer). It follows the Overview and Clients exactly: the same range, the
 * same Showing choice (`calendar_id`, `business=<id>` or `business=all`) and `compare`, all of it in
 * the key, so one scope's figures are never shown for another.
 */
export function useReportMeasures(
  from: string,
  to: string,
  enabled = true,
  scope: ReportScopeQuery | string | null = null,
) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;
  const s = normaliseScopeQuery(scope);
  const query = withScopeParams(`from=${from}&to=${to}`, s);

  return useQuery({
    queryKey: queryKeys.reports.measures(accessToken, from, to, s.calendarId ?? null, s.business ?? null, s.compare ?? null),
    enabled: queryEnabled,
    ...scopeRetryOption(s),
    queryFn: async (): Promise<SalonMeasuresReport> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<SalonMeasuresReport>(`/api/venue/reports/measures?${query}`, {
        accessToken,
      });
    },
  });
}
