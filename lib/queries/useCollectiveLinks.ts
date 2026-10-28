/**
 * Inviting any venue into a collective, and the venues joining it (web 2026-10-28). Every route is
 * admin-only and takes the app's Bearer token.
 *
 *   linked venues to invite   GET   /api/venue/collectives/candidates
 *   what inviting one takes   GET   /api/venue/collectives/[id]/invite-check?venueId= or ?slug= (host)
 *   venues joining            GET   /api/venue/collectives/link-todos
 *
 * The app never asks to link or accepts a request for a collective: accepting the invitation links
 * the venue joining with every venue in the collective and joins, in one step, on the server (web
 * `collective-join-links.ts`). Only a link already in force with less than full access holds a
 * venue up, and that is changed in Linked venues.
 */
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { CollectiveCandidate, InviteCheck, InviteeLinkTodo } from '@/types/collectives';

/** GET /api/venue/collectives/candidates: every venue the host is linked with, and whether it can join. */
export function useCollectiveCandidates(options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && (options?.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.collectives.candidates(accessToken),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<CollectiveCandidate[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ candidates?: CollectiveCandidate[] }>('/api/venue/collectives/candidates', {
        accessToken,
      });
      return data.candidates ?? [];
    },
  });
}

/** One read of what inviting a venue will take, by id or by booking address. */
export async function fetchInviteCheck(
  accessToken: string,
  collectiveId: string,
  query: { venueId: string } | { slug: string },
): Promise<InviteCheck> {
  const params =
    'venueId' in query ? `venueId=${encodeURIComponent(query.venueId)}` : `slug=${encodeURIComponent(query.slug)}`;
  return apiFetch<InviteCheck>(`/api/venue/collectives/${collectiveId}/invite-check?${params}`, { accessToken });
}

/**
 * What an invited venue is waiting for, read from the same check the invite sheet uses so the two
 * never disagree (web `InvitedVenueStatus`). A failure leaves the row as it was: "(invited)".
 */
export function useInviteCheck(collectiveId: string | null, venueId: string | null, options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled =
    isBackendConfigured() && accessToken !== null && Boolean(collectiveId) && Boolean(venueId) && (options?.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.collectives.inviteCheck(accessToken, collectiveId, venueId),
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<InviteCheck> => {
      if (!accessToken || !collectiveId || !venueId) throw new Error('Missing access token');
      return fetchInviteCheck(accessToken, collectiveId, { venueId });
    },
  });
}

/** GET /api/venue/collectives/link-todos: each venue invited to this venue's collective that still needs a link with it. */
export function useLinkTodos(options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && (options?.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.collectives.linkTodos(accessToken),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<InviteeLinkTodo[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ todos?: InviteeLinkTodo[] }>('/api/venue/collectives/link-todos', { accessToken });
      return data.todos ?? [];
    },
  });
}
