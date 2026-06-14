import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface HouseholdMember {
  guest_id: string;
  name: string | null;
  is_primary: boolean;
}

export interface HouseholdBlock {
  id: string;
  name: string | null;
  members: HouseholdMember[];
}

export interface GuestHouseholdResponse {
  households: HouseholdBlock[];
}

const householdKey = (accessToken: string | null, guestId: string | null | undefined) =>
  [...queryKeys.guests.all(), 'household', keyScope(accessToken), guestId ?? null] as const;

/** GET /api/venue/guests/[guestId]/household — fetch household links for a contact. */
export function useGuestHousehold(guestId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(guestId);

  return useQuery({
    queryKey: householdKey(accessToken, guestId),
    enabled,
    queryFn: async (): Promise<GuestHouseholdResponse> => {
      if (!accessToken || !guestId) {
        throw new Error('Missing household parameters');
      }
      return apiFetch<GuestHouseholdResponse>(`/api/venue/guests/${guestId}/household`, {
        accessToken,
      });
    },
  });
}

/** POST /api/venue/guests/[guestId]/household — link another guest into the household. */
export function useAddToHousehold(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (other_guest_id: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/guests/${guestId}/household`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ other_guest_id }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: householdKey(accessToken, guestId),
      });
    },
  });
}
