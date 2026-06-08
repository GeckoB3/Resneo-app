import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { VenueBootstrap } from '@/types/venue';

/**
 * Loads venue bootstrap data (name, models, tier, terminology, feature flags).
 * Disabled until backend env vars and a Supabase session are present.
 */
export function useVenue() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.venue.bootstrap(accessToken),
    enabled,
    queryFn: async (): Promise<VenueBootstrap> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<VenueBootstrap>('/api/venue', { accessToken });
    },
  });
}
