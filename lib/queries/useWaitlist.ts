import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import {
  invalidateAppointmentAvailability,
  invalidateAvailabilityIfSlotTaken,
} from '@/lib/queries/invalidateAvailability';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  WaitlistAlertsResponse,
  WaitlistKind,
  WaitlistResponse,
  WaitlistStatus,
} from '@/types/waitlist';

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
 * Returns `notify_failed` when the backend could not send a guest notification.
 */
export function useUpdateWaitlistEntry() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: WaitlistStatus;
      expires_at?: string;
    }): Promise<{ booking_id?: string; notify_failed?: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ booking_id?: string; notify_failed?: boolean }>(`/api/venue/waitlist`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
      // Converting an entry WRITES a booking, so it fills a slot exactly as the
      // create paths do — and this was the one booking write that never said so.
      invalidateAppointmentAvailability(queryClient);
    },
    // The conversion re-checks the slot immediately before its insert and 409s
    // if it has gone (R16-3), which is itself proof the cached pickers are stale.
    onError: (error) => invalidateAvailabilityIfSlotTaken(queryClient, error),
  });
}

/**
 * DELETE /api/venue/waitlist — permanently remove an expired/cancelled entry.
 * Body: { id }. On success, invalidates the waitlist list.
 */
export function useDeleteWaitlistEntry() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>('/api/venue/waitlist', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
    },
  });
}

/**
 * GET /api/venue/waitlist/alerts — open slot opportunity alerts for staff_choose mode.
 * Only returns data when the venue is in staff_choose waitlist mode.
 */
export function useWaitlistAlerts(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = isBackendConfigured() && accessToken !== null && enabled;

  return useQuery({
    queryKey: [...queryKeys.waitlist.all(), 'alerts', keyScope(accessToken)] as const,
    enabled: queryEnabled,
    queryFn: async (): Promise<WaitlistAlertsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<WaitlistAlertsResponse>('/api/venue/waitlist/alerts', { accessToken });
    },
  });
}

/**
 * POST /api/venue/waitlist/alerts — offer or dismiss a staff-choose alert.
 * Body: { id, action: 'offer' | 'dismiss' }
 */
export function useActOnWaitlistAlert() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      action: 'offer' | 'dismiss';
    }): Promise<{ success: boolean; waitlist_entry_id?: string; guest_name?: string; email_sent?: boolean; sms_sent?: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch('/api/venue/waitlist/alerts', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
    },
  });
}
