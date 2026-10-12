import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { calendarRetryOption, withCalendarParam } from '@/lib/reports/report-calendar';
import type { ReportsResponse } from '@/types/reports';

/**
 * GET /api/venue/reports?from=&to=: the admin-only analytics payload (Bearer).
 *
 * `calendarId` asks for one calendar's figures (`calendar_id`, lib/reports/report-calendar.ts):
 * the answer then echoes `calendar`. It is part of the key, so one calendar's figures are never
 * shown for another or for the whole venue.
 */
export function useReports(from: string, to: string, enabled = true, calendarId: string | null = null) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;
  const query = withCalendarParam(`from=${from}&to=${to}`, calendarId);

  return useQuery({
    queryKey: queryKeys.reports.range(accessToken, from, to, calendarId),
    enabled: queryEnabled,
    ...calendarRetryOption(calendarId),
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
