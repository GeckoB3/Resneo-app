import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { AddonGroupsResponse } from '@/types/addon-groups';

/** GET /api/venue/addon-groups — the venue's add-on catalogue (Bearer). */
export function useAddonGroups(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.addonGroups.list(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<AddonGroupsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<AddonGroupsResponse>('/api/venue/addon-groups', { accessToken });
    },
  });
}
