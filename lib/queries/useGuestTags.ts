import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** GET /api/venue/guests/tags — distinct contact tags (filter chips). */
export function useGuestTags() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.guests.all(), 'tags', accessToken ?? null],
    enabled,
    queryFn: async (): Promise<{ tags: string[] }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ tags: string[] }>('/api/venue/guests/tags', { accessToken });
    },
  });
}
