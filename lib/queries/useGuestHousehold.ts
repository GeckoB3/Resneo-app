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
    onSuccess: (_data, otherGuestId) => {
      // Household links are symmetric — refresh BOTH guests' household blocks so
      // the newly-linked contact's profile reflects the link without a remount.
      void queryClient.invalidateQueries({ queryKey: householdKey(accessToken, guestId) });
      void queryClient.invalidateQueries({ queryKey: householdKey(accessToken, otherGuestId) });
    },
  });
}

export interface UnlinkFromHouseholdResponse {
  success: boolean;
  /** The households the two shared (or, leaving, this contact's own). */
  household_ids: string[];
  /** True when a household was left with one member and so removed. */
  dissolved: boolean;
  /** Set when they were not linked any more: repeating an unlink is harmless. */
  already_unlinked?: boolean;
}

/**
 * DELETE /api/venue/guests/[guestId]/household?other_guest_id= (web QA FD-9,
 * 2026-09-23): take that contact out of the household it shares with this one.
 * Passing this contact's own id takes it out of its household instead. A
 * household left with one member is removed by the server.
 */
export function useUnlinkFromHousehold(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (otherGuestId: string): Promise<UnlinkFromHouseholdResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<UnlinkFromHouseholdResponse>(
        `/api/venue/guests/${guestId}/household?other_guest_id=${encodeURIComponent(otherGuestId)}`,
        { accessToken, method: 'DELETE' },
      );
    },
    onSuccess: (_data, otherGuestId) => {
      // Both contacts lose the link (and gain a "household unlinked" timeline
      // entry), so refresh both of their household blocks and timelines.
      for (const id of new Set([guestId, otherGuestId])) {
        void queryClient.invalidateQueries({ queryKey: householdKey(accessToken, id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.guests.timeline(accessToken, id) });
      }
    },
  });
}
