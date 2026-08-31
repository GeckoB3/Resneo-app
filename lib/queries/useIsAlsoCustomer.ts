import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useRole } from '@/lib/queries/useRole';

interface VenuesResponse {
  venues: { venue_id: string; venue_name: string | null }[];
}

/**
 * Whether this staff member is ALSO somebody's customer.
 *
 * The web decides where to send a person from two facts, `hasStaff` and
 * `hasGuest`, and shows a chooser when both are true and no preference is set.
 * This app has only had the first: a 401 from `staff/me` says somebody is not
 * staff, and nothing said whether a staff member also books things elsewhere.
 * `GET /api/v1/me/venues` returns one row per venue the caller is known at,
 * which is exactly the missing fact.
 *
 * **This deliberately does NOT feed the routing decision.** `useAppMode` keeps
 * the two inputs it has. Adding a third asynchronous input to the guard
 * sequence is what produced the bug where a customer's first frame said
 * "staff", mounted the venue navigator and 401'd; the cost of getting it wrong
 * there is a mounted navigator, and the cost of getting it wrong here is a
 * prompt that does not appear. So the question is asked AFTER the person has
 * landed, and its answer only ever offers them a door.
 *
 * Only asked of staff. A confirmed customer has no other side to be offered,
 * and an unresolved role has no landing to prompt over yet.
 */
export function useIsAlsoCustomer() {
  const accessToken = useAccessToken();
  const role = useRole();

  const query = useQuery({
    queryKey: queryKeys.customer.venues(accessToken),
    enabled: isBackendConfigured() && accessToken !== null && role === 'staff',
    // The answer does not change within a session, and it gates a once-ever
    // prompt, so there is nothing to be gained by rechecking it.
    staleTime: Infinity,
    queryFn: async (): Promise<VenuesResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<VenuesResponse>('/api/v1/me/venues', { accessToken });
    },
  });

  return {
    /**
     * True only on a positive answer.
     *
     * A failed or pending read is NOT "no". It is "we do not know", and the
     * prompt simply stays away: offering nothing is the safe direction, whereas
     * offering a door to an account somebody does not have is a dead end.
     */
    isAlsoCustomer: (query.data?.venues?.length ?? 0) > 0,
    isResolved: query.isSuccess,
  };
}
