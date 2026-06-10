import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { ReportsResponse } from '@/types/reports';

/** GET /api/venue/reports?from=&to= — admin-only analytics payload (Bearer). */
export function useReports(from: string, to: string, enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.reports.range(accessToken, from, to),
    enabled: queryEnabled,
    queryFn: async (): Promise<ReportsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ReportsResponse>(`/api/venue/reports?from=${from}&to=${to}`, {
        accessToken,
      });
    },
  });
}
