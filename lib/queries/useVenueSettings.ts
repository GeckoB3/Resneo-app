import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

import type { OpeningHours, VenueFeatureFlagsRaw } from '@/types/venue';

/** Editable venue fields on PATCH /api/venue (admin only). */
export interface UpdateVenueInput {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  /** Booking-page slug (lowercase letters, numbers, hyphens). */
  slug?: string;
  /** IANA timezone string, e.g. 'Europe/London'. */
  timezone?: string;
  /** Minutes after appointment time that staff can mark a no-show (10–60). */
  no_show_grace_minutes?: number;
  /** Logo image URL (returned by POST /api/venue/logo). */
  logo_url?: string | null;
  /** Cover photo URL (returned by POST /api/venue/cover). */
  cover_photo_url?: string | null;
  /** Cuisine type (non-appointments venues). */
  cuisine_type?: string;
  /** Price band £/££/£££ (non-appointments venues). */
  price_band?: string;
  /** Kitchen digest email (non-appointments venues). */
  kitchen_email?: string;
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

/** Response shape from GET/PATCH /api/venue/feature-flags. */
export interface FeatureFlagsResponse {
  raw: VenueFeatureFlagsRaw;
  resolved: Record<string, boolean>;
  any_available_practitioner_config?: {
    mode: 'priority' | 'random';
    calendar_order: string[];
  };
  calendars?: { id: string; name: string }[];
}

/** PATCH /api/venue/feature-flags — per-venue feature flag overrides (admin only). */
export function useUpdateFeatureFlags() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: VenueFeatureFlagsRaw): Promise<FeatureFlagsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<FeatureFlagsResponse>('/api/venue/feature-flags', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    onSuccess: () => {
      // Invalidate venue bootstrap so feature_flags.resolved is refreshed everywhere.
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
