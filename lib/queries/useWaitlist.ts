import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { WaitlistKind, WaitlistResponse, WaitlistStatus } from '@/types/waitlist';

/** GET /api/venue/waitlist?kind= (Bearer). */
export function useWaitlist(kind: WaitlistKind) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.waitlist.list(accessToken, kind),
    enabled,
    queryFn: async (): Promise<WaitlistResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<WaitlistResponse>(`/api/venue/waitlist?kind=${kind}`, { accessToken });
    },
  });
}

/**
 * PATCH /api/venue/waitlist — update a waitlist entry's status
 * (offer / confirm → creates a booking / cancel). Invalidates the list + bookings.
 */
export function useUpdateWaitlistEntry() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: WaitlistStatus;
      expires_at?: string;
    }): Promise<{ booking_id?: string }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ booking_id?: string }>(`/api/venue/waitlist`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}
