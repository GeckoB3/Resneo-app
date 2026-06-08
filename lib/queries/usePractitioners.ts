import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { PractitionersResponse } from '@/types/practitioner';

type UsePractitionersOptions = {
  /** Linked-venue context, when acting on a partner venue's roster. */
  ownerVenueId?: string | null;
  enabled?: boolean;
};

/**
 * Loads the venue's bookable calendar columns (practitioners) for the calendar
 * grid. Asks for the full active, staff-assignable roster.
 */
export function usePractitioners(options: UsePractitionersOptions = {}) {
  const accessToken = useAccessToken();
  const ownerVenueId = options.ownerVenueId ?? null;
  const queryEnabled =
    (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.practitioners.list(accessToken, ownerVenueId),
    enabled: queryEnabled,
    queryFn: async (): Promise<PractitionersResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({
        roster: '1',
        active_only: '1',
        staff_assignable: '1',
      });
      if (ownerVenueId) {
        params.set('owner_venue_id', ownerVenueId);
      }
      return apiFetch<PractitionersResponse>(`/api/venue/practitioners?${params}`, {
        accessToken,
      });
    },
  });
}
