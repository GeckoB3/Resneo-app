import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { DashboardHomePayload } from '@/types/dashboard';

/**
 * Loads the venue dashboard home summary (today stats + recent bookings).
 * Disabled until backend env vars and a Supabase session are present.
 */
export function useDashboardHome() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.dashboard.home(accessToken),
    enabled,
    queryFn: async (): Promise<DashboardHomePayload> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<DashboardHomePayload>('/api/venue/dashboard-home', { accessToken });
    },
  });
}
