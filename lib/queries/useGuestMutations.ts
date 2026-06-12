import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { GuestTimelineResponse } from '@/types/guest-timeline';

/** Editable fields on PATCH /api/venue/guests/[guestId]. */
export interface UpdateGuestInput {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  customer_profile_notes?: string | null;
  marketing_consent?: boolean;
  marketing_opt_out?: boolean;
  /** Custom client field values — keys are field_key strings. */
  custom_fields?: Record<string, unknown>;
  /** Contact address (client-address services). */
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_postcode?: string | null;
}

/**
 * PATCH /api/venue/guests/[guestId] — edit guest profile, tags, notes, marketing.
 * Invalidates the guest detail + list so the screen refreshes.
 */
export function useUpdateGuest(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateGuestInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/guests/${guestId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
      // Booking detail embeds the guest (tags, profile notes) — refresh it too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    },
  });
}

/**
 * POST /api/venue/guests/[guestId]/message — send a custom email/SMS to the guest.
 */
export function useSendGuestMessage(guestId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      message: string;
      channel: 'email' | 'sms' | 'both';
    }): Promise<{ success: boolean; errors?: string[] }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean; errors?: string[] }>(
        `/api/venue/guests/${guestId}/message`,
        { accessToken, method: 'POST', body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.timeline(accessToken, guestId) });
    },
  });
}

/**
 * POST /api/venue/gdpr/erase-guest — permanently erase a guest's personal data (GDPR).
 * Invalidates the guest list so the screen refreshes after erasure.
 */
export function useEraseGuest() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ guestId }: { guestId: string }): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>('/api/venue/gdpr/erase-guest', {
        method: 'POST',
        body: JSON.stringify({ guest_id: guestId }),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
    },
  });
}

/** GET /api/venue/guests/[guestId]/timeline — merged activity feed (Bearer). */
export function useGuestTimeline(guestId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(guestId);

  return useQuery({
    queryKey: queryKeys.guests.timeline(accessToken, guestId),
    enabled,
    queryFn: async (): Promise<GuestTimelineResponse> => {
      if (!accessToken || !guestId) {
        throw new Error('Missing timeline parameters');
      }
      return apiFetch<GuestTimelineResponse>(`/api/venue/guests/${guestId}/timeline`, {
        accessToken,
      });
    },
  });
}
