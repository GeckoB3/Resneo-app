import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { Practitioner, PractitionersResponse } from '@/types/practitioner';

const NO_CALENDARS: Practitioner[] = [];

/**
 * The calendars this person may block time on, the same rule the blocks route applies: an admin any
 * live calendar, anyone else only the ones assigned to them.
 *
 * `GET /api/venue/practitioners` already answers that when asked WITHOUT `roster=1` (the flag
 * `usePractitioners` sends so a staff member can see the whole diary); `staff_assignable` drops
 * paused calendars and resources. Empty until loaded, so nothing is offered that may be refused.
 */
export function useBlockableCalendars(options: { enabled?: boolean } = {}): Practitioner[] {
  const accessToken = useAccessToken();
  const query = useQuery({
    queryKey: queryKeys.practitioners.blockable(accessToken),
    enabled: (options.enabled ?? true) && isBackendConfigured() && accessToken !== null,
    queryFn: async (): Promise<PractitionersResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<PractitionersResponse>('/api/venue/practitioners?staff_assignable=1', { accessToken });
    },
  });
  return query.data?.practitioners ?? NO_CALENDARS;
}
