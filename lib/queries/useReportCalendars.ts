import { useQuery } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { parseReportCalendars } from '@/lib/reports/report-calendar';
import type { ReportCalendarOption } from '@/types/reports';

/**
 * The calendars Reports can be filtered by: `GET /api/venue/reports/calendars` →
 * `{ calendars: [{ id, name, active }] }`, active first and then by name, in the server's order.
 * A server before the filter (404), or one that does not offer it to this login (403), reads as no
 * calendars, so no picker shows and every report stays the whole venue, as before.
 */
export function useReportCalendars(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.calendars(accessToken),
    enabled: queryEnabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ReportCalendarOption[]> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        return parseReportCalendars(await apiFetch<unknown>('/api/venue/reports/calendars', { accessToken }));
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return [];
        throw error;
      }
    },
  });
}
