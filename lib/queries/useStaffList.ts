import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { TeamListResponse } from '@/types/staff';

export type { TeamListResponse } from '@/types/staff';
export type { TeamMember } from '@/types/staff';

/** GET /api/venue/staff — team logins & roles (admin only, Bearer). */
export function useStaffList(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.team.list(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<TeamListResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<TeamListResponse>('/api/venue/staff', { accessToken });
    },
  });
}
