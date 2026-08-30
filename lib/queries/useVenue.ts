import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useRole } from '@/lib/queries/useRole';
import type { VenueBootstrap } from '@/types/venue';

/**
 * Loads venue bootstrap data (name, models, tier, terminology, feature flags).
 * Disabled until backend env vars and a Supabase session are present.
 */
export function useVenue() {
  const accessToken = useAccessToken();
  const role = useRole();
  /*
    Not `role === 'staff'`, and the difference is the whole point.

    `/api/venue` answers only for staff, so a customer's request is doomed and
    TanStack retries it three times before giving up. Stopping that is the aim.
    But gating on a POSITIVE staff answer would put every staff member's venue
    bootstrap behind their staff/me round trip, where today the two run in
    parallel. The tabs render off this data, so that is a visible delay on every
    staff sign-in, paid by everyone, to spare a customer some wasted requests
    they never see.

    Gating on "not a confirmed customer" costs staff nothing: the role is
    'loading' on first render, so the request goes out exactly as it does today.
    It only stops the retries and refetches once we positively know the caller
    is not staff, which is where the ongoing cost actually is.
  */
  const enabled = isBackendConfigured() && accessToken !== null && role !== 'customer';

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
