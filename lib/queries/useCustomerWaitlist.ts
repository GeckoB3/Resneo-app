import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface WaitlistEntry {
  id: string;
  venue_id: string;
  waitlist_kind: string | null;
  status: string;
  desired_date: string | null;
  desired_time: string | null;
  desired_time_end: string | null;
  /** Set when the venue has offered this place and is waiting for an answer. */
  offered_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * Places the customer is waiting for.
 *
 * The response carries no contact details, deliberately: a waitlist row holds
 * the name, email and phone somebody gave the venue, and none of it needs to
 * come back to the person who supplied it.
 */
export function useCustomerWaitlist() {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.waitlist(accessToken),
    enabled: isBackendConfigured() && accessToken !== null,
    queryFn: async (): Promise<{ entries: WaitlistEntry[] }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ entries: WaitlistEntry[] }>('/api/v1/me/waitlist', { accessToken });
    },
  });
}

export type LeaveWaitlistOutcome =
  | { status: 'left' }
  /** Already gone: taken, expired, or cancelled by the venue. */
  | { status: 'already_gone' };

/**
 * Leave a waitlist place.
 *
 * A 409 is not a failure. It means the place went while the screen was open,
 * which happens constantly on a waitlist, and the honest response is to tell
 * the customer it is no longer theirs to cancel rather than to show an error
 * about a thing that has already resolved itself.
 */
export function useLeaveWaitlist() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryId: string): Promise<LeaveWaitlistOutcome> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        await apiFetch(`/api/v1/me/waitlist/${encodeURIComponent(entryId)}`, {
          accessToken,
          method: 'DELETE',
        });
        return { status: 'left' };
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          return { status: 'already_gone' };
        }
        throw error;
      }
    },
    /*
      Refreshed either way, unlike the card removal. A 409 here means the list
      on screen is ALREADY WRONG, so refetching is the point rather than noise.
    */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
    },
  });
}

/** Statuses a customer can still act on. Anything else is history. */
const LIVE = new Set(['waiting', 'active', 'offered', 'pending']);

export function isLiveWaitlistEntry(entry: WaitlistEntry): boolean {
  return LIVE.has(entry.status);
}
