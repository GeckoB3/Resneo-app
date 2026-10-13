import { useQuery } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { NO_SHOWING_OPTIONS, parseReportShowingOptions } from '@/lib/reports/report-scope';
import type { ReportShowingOptions } from '@/types/reports';

/**
 * What Reports can show (the "Showing" picker, lib/reports/report-scope.ts):
 * `GET /api/venue/reports/calendars` → `{ venue, calendars, businesses, together }`, calendars active
 * first and then by name, businesses by name, in the server's order. An older server sends only
 * `calendars`, read as no businesses. A server before the filter (404), or one that does not offer
 * it to this login (403), reads as nothing to choose, so no picker shows and every report stays the
 * whole venue, as before.
 *
 * `allowBusinesses` false (a team member's panel) drops any business whatever the server sent:
 * partner and together scopes are for admins only.
 */
export function useReportCalendars(enabled = true, allowBusinesses = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.calendars(accessToken),
    enabled: queryEnabled,
    staleTime: 5 * 60_000,
    retry: false,
    // The raw answer is cached; each reader takes its own view of it.
    select: (body: unknown): ReportShowingOptions => parseReportShowingOptions(body, allowBusinesses),
    queryFn: async (): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        return await apiFetch<unknown>('/api/venue/reports/calendars', { accessToken });
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return NO_SHOWING_OPTIONS;
        throw error;
      }
    },
  });
}
