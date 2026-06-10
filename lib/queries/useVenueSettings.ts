import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

import type { OpeningHours } from '@/types/venue';

/** Editable venue fields on PATCH /api/venue (admin only). */
export interface UpdateVenueInput {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  /** Appointments-tier source of truth for bookable models (primary stays first). */
  active_booking_models?: string[];
  enabled_models?: string[];
  require_account_login_for_bookings?: boolean;
}

/** PATCH /api/venue — update venue profile basics; refreshes the bootstrap. */
export function useUpdateVenue() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateVenueInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}

/** PATCH /api/venue/opening-hours — replace weekly hours (admin only). */
export function useUpdateOpeningHours() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hours: OpeningHours): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/opening-hours', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(hours),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
      // Hours change which slots the availability engine offers.
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}
