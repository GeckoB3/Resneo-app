import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { normaliseScopeQuery, scopeRetryOption, withScopeParams, type ReportScopeQuery } from '@/lib/reports/report-scope';
import type { ReportsResponse } from '@/types/reports';

/**
 * GET /api/venue/reports?from=&to=: the admin-only analytics payload (Bearer).
 *
 * `scope` is what the Showing picker chose (lib/reports/report-scope.ts): `calendar_id` (yours or a
 * partner's shared calendar), `business=<id>` or `business=all`, and `compare=previous|last_year`.
 * A bare string is one calendar, as before release 1. All of it is in the key, so one scope's
 * figures are never shown for another.
 */
export function useReports(
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
    queryKey: queryKeys.reports.range(accessToken, from, to, s.calendarId ?? null, s.business ?? null, s.compare ?? null),
    enabled: queryEnabled,
    ...scopeRetryOption(s),
    queryFn: async (): Promise<ReportsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ReportsResponse>(`/api/venue/reports?${query}`, {
        accessToken,
      });
    },
  });
}
