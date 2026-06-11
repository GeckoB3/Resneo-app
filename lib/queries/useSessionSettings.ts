import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { SessionSettingsResponse } from '@/types/staff';

/** GET /api/venue/staff/session-settings — loads venue-wide session timeout. */
export function useSessionSettings(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.team.sessionSettings(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<SessionSettingsResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<SessionSettingsResponse>('/api/venue/staff/session-settings', {
        accessToken,
      });
    },
  });
}
