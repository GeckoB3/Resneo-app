/**
 * Leaving a shared-services collective (CQ-10.1; web `LeaveCollectiveDialog` in
 * `collective/ReleaseReview.tsx`, 2026-10-29). Both routes take the app's Bearer token
 * (`resolveLinkAdmin`), admins only.
 *
 *   what leaving changes   GET   /api/venue/collectives/[id]/leave
 *   leave                  PATCH /api/venue/collectives/[id]/members  { action: 'leave' }  ->  { review }
 *
 * The preview answers 409 for a collective that does not run on shared services; the sheet then says
 * what it always said and still lets the venue leave.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { collectiveServiceToolKeys, type ReleaseReview } from '@/lib/queries/useCollectiveServiceTools';

/** What the Leave sheet says before the member confirms. */
export interface LeavePreview {
  collective_name: string;
  host_name: string;
  /** Services from the host that become the venue's own. */
  services: number;
  /** Of those, the ones that take a payment the venue cannot take without Stripe. */
  no_stripe: number;
  /** The other venues still in, whose account links stay as they are. */
  other_venues: string[];
  /** Leaving ends the collective (fewer than two venues, and no invitation to wait for). */
  last_member: boolean;
}

export function leavePreviewKey(accessToken: string | null, collectiveId: string | null) {
  return [...queryKeys.collectives.all(), 'leavePreview', keyScope(accessToken), collectiveId] as const;
}

/** GET the preview while the sheet is open. Read fresh each time: it changes as venues come and go. */
export function useLeavePreview(collectiveId: string | null, enabled: boolean) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: leavePreviewKey(accessToken, collectiveId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!collectiveId,
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<LeavePreview> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      return apiFetch<LeavePreview>(`/api/venue/collectives/${collectiveId}/leave`, { accessToken });
    },
  });
}

/**
 * Leave. The answer's review (the checklist after leaving) goes straight into the cache the Venue
 * collectives and Services screens read, so the venue lands on it without waiting for a refetch.
 */
export function useLeaveCollective(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ review: ReleaseReview | null }> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const data = await apiFetch<{ review?: ReleaseReview | null }>(`/api/venue/collectives/${collectiveId}/members`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ action: 'leave' }),
      });
      return { review: data?.review ?? null };
    },
    onSuccess: ({ review }) => {
      if (review) queryClient.setQueryData(collectiveServiceToolKeys.releaseReview(accessToken), review);
      void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
      // The review lives under the collectives key too: refetching it reads the same review back.
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffCollective.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedVenues.all() });
    },
  });
}
