/**
 * The venue's ResNeo marketplace listing (web Settings, Booking Page, "ResNeo marketplace").
 *
 *   GET   /api/venue/marketplace   any staff member; Bearer via createVenueRouteClient
 *   PATCH /api/venue/marketplace   `{ listed?, categories? }`, admin only; returns the new state
 *
 * The GET never fails loudly: an older server or an unapplied migration answers
 * `available: false`, and the card then hides itself as it does on the web.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import type { MarketplaceOwnerState, MarketplacePatch } from '@/lib/marketplace/owner-state';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export const marketplaceKeys = {
  owner: (accessToken: string | null) =>
    [...queryKeys.venue.all(), 'marketplace', keyScope(accessToken)] as const,
};

export function useMarketplaceOwnerState(enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: marketplaceKeys.owner(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    // Authenticated dashboard read: always fresh on open, as the web's no-store fetch.
    staleTime: 0,
    queryFn: async (): Promise<MarketplaceOwnerState> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<MarketplaceOwnerState>('/api/venue/marketplace', { accessToken });
    },
  });
}

export function useUpdateMarketplace() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: MarketplacePatch): Promise<MarketplaceOwnerState> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<MarketplaceOwnerState>('/api/venue/marketplace', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    onSuccess: (state) => {
      queryClient.setQueryData(marketplaceKeys.owner(accessToken), state);
    },
  });
}
