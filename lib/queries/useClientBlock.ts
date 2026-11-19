import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Blocking a client from booking online (web Docs/blocked-clients-plan.md, 2026-11-19).
 * GET/POST/DELETE /api/venue/guests/{id}/block, Bearer.
 */

export interface ClientBlockSummary {
  block_id: string;
  blocked_at: string;
  /** Set by this business. */
  own: boolean;
  venue_id: string;
  venue_name: string;
  /** This business's own team only. */
  blocked_by_name: string | null;
  /** This business's own block, or any when this business hosts the collective. */
  reason: string | null;
  can_unblock: boolean;
  /** This business's block on another client who shares this client's email or phone: their name. */
  through_client_name?: string | null;
}

export interface ClientBlockPreview {
  shared_with: { id: string; name: string }[];
  upcoming: { id: string; booking_date: string; booking_time: string | null; status: string }[];
  standing_class_bookings: number;
  waitlist_places: number;
  scope: { collective: boolean; business_count: number };
}

export interface ClientBlockState {
  blocks: ClientBlockSummary[];
  blocked: boolean;
  /** False when the server cannot make blocks yet (no hashing key). */
  available: boolean;
  /** An admin, and this business has not blocked them. */
  can_block: boolean;
  has_contact_details: boolean;
  preview: ClientBlockPreview | null;
}

export function useClientBlock(
  guestId: string | null | undefined,
  options?: {
    preview?: boolean;
    enabled?: boolean;
    /**
     * The collective member the booking is at, when it is not the signed-in business: the warning
     * then follows that business's block rules, and works for a client picked from another member.
     */
    bookingVenueId?: string | null;
  },
) {
  const accessToken = useAccessToken();
  const preview = options?.preview === true;
  const bookingVenueId = options?.bookingVenueId ?? null;
  const params = [
    ...(preview ? ['preview=1'] : []),
    ...(bookingVenueId ? [`booking_venue_id=${encodeURIComponent(bookingVenueId)}`] : []),
  ];
  return useQuery({
    queryKey: [...queryKeys.guests.block(accessToken, guestId, preview), bookingVenueId],
    enabled: (options?.enabled ?? true) && isBackendConfigured() && accessToken !== null && Boolean(guestId),
    retry: false,
    queryFn: async (): Promise<ClientBlockState | null> => {
      if (!accessToken || !guestId) throw new Error('Missing client');
      try {
        return await apiFetch<ClientBlockState>(
          `/api/venue/guests/${encodeURIComponent(guestId)}/block${params.length > 0 ? `?${params.join('&')}` : ''}`,
          { accessToken },
        );
      } catch {
        // An older server has no block route: nothing to show.
        return null;
      }
    },
  });
}

/** POST: block (admins). Refreshes the client, the list and the timeline. */
export function useBlockClient(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string | null): Promise<ClientBlockState> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<ClientBlockState>(`/api/venue/guests/${encodeURIComponent(guestId)}/block`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason?.trim() ? reason.trim() : null }),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
    },
  });
}

/** DELETE: unblock (admins of the business that set it, or the collective's host). */
export function useUnblockClient(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockId: string): Promise<ClientBlockState> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<ClientBlockState>(`/api/venue/guests/${encodeURIComponent(guestId)}/block`, {
        method: 'DELETE',
        body: JSON.stringify({ block_id: blockId }),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
    },
  });
}

/** POST /api/venue/contacts/bulk `block`: the ticked contacts (admins). */
export function useBulkBlockClients() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (guestIds: string[]): Promise<{ blocked: number; already_blocked: number }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ blocked: number; already_blocked: number }>('/api/venue/contacts/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'block', guest_ids: guestIds }),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
    },
  });
}
