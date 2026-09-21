/**
 * Classes, events and resources on the combined booking page (web 2026-09-21,
 * `Docs/classes-events-resources-review-and-collective-plan.md` §4.3, decisions A to G).
 *
 * A listing points at a member's own class type, event series or resource; nothing is copied.
 * The owning venue keeps its prices, hours and rosters, and a booking made through the page
 * lands on that venue with `collective_id` and `collective_listing_id` recorded.
 *
 *   GET    /api/venue/collectives/[id]/listings   every member's items with their listing state
 *   POST   /api/venue/collectives/[id]/listings   { venue_id, entity_type, entity_id }
 *   DELETE /api/venue/collectives/[id]/listings   { listing_id }
 *   GET    /api/venue/collective-listings          this venue's own listed items (for chips)
 *
 * @see _reference/Resneo/src/app/api/venue/collectives/[id]/listings/route.ts
 * @see _reference/Resneo/src/app/api/venue/collective-listings/route.ts
 * @see _reference/Resneo/src/lib/linked-accounts/collective-listings.ts
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export type ListingEntityType = 'class' | 'event' | 'resource';

export interface ListableItem {
  entityType: ListingEntityType;
  entityId: string;
  name: string;
  /** The owning venue's own terms: "60 min · 10 spots · £12.00", "2026-09-29 · 2 dates", "£20 per 30 min". */
  detail: string | null;
  isActive: boolean;
  listing: { id: string; status: 'active' | 'withdrawn' } | null;
}

export interface ListableVenue {
  venueId: string;
  venueName: string;
  isHost: boolean;
  items: ListableItem[];
}

export interface CollectiveListingsResponse {
  venues: ListableVenue[];
  host_venue_id: string;
  my_venue_id: string;
  is_host: boolean;
}

export interface OwnListing {
  listing_id: string;
  collective_id: string;
  collective_name: string;
  entity_type: ListingEntityType;
  entity_id: string;
}

function keyScope(accessToken: string | null): string {
  return accessToken ? accessToken.slice(-12) : 'anon';
}

export const collectiveListingsKeys = {
  all: (collectiveId: string | null, accessToken: string | null) =>
    ['collectiveListings', keyScope(accessToken), collectiveId] as const,
  own: (accessToken: string | null) => ['ownCollectiveListings', keyScope(accessToken)] as const,
};

export function useCollectiveListings(collectiveId: string | null, enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: collectiveListingsKeys.all(collectiveId, accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!collectiveId,
    queryFn: async (): Promise<CollectiveListingsResponse> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      return apiFetch<CollectiveListingsResponse>(`/api/venue/collectives/${collectiveId}/listings`, {
        accessToken,
      });
    },
  });
}

/** List an item (host: any member's; member: its own) or withdraw one. */
export function useCollectiveListingToggle(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { action: 'list'; venueId: string; entityType: ListingEntityType; entityId: string }
        | { action: 'withdraw'; listingId: string },
    ): Promise<{ listing: { id: string; status: 'active' | 'withdrawn' } }> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const url = `/api/venue/collectives/${collectiveId}/listings`;
      if (input.action === 'list') {
        return apiFetch(url, {
          accessToken,
          method: 'POST',
          body: JSON.stringify({
            venue_id: input.venueId,
            entity_type: input.entityType,
            entity_id: input.entityId,
          }),
        });
      }
      return apiFetch(url, {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ listing_id: input.listingId }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['collectiveListings'] });
      void queryClient.invalidateQueries({ queryKey: ['ownCollectiveListings'] });
    },
  });
}

/** This venue's items that are on a live combined page, for "Listed on {collective}" badges. */
export function useOwnCollectiveListings(enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: collectiveListingsKeys.own(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<OwnListing[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ listings?: OwnListing[] }>('/api/venue/collective-listings', {
        accessToken,
      });
      return data.listings ?? [];
    },
  });
}

/** The collective an item is listed on, or null. */
export function listedOn(
  listings: readonly OwnListing[] | undefined,
  entityType: ListingEntityType,
  entityId: string,
): OwnListing | null {
  return listings?.find((l) => l.entity_type === entityType && l.entity_id === entityId) ?? null;
}
