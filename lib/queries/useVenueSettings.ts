import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
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

/** One bookable calendar/practitioner column shown in the priority reorder list. */
export interface FeatureFlagsCalendar {
  id: string;
  name: string;
}

/** Any-available-practitioner config returned by the feature-flags endpoint. */
export interface AnyAvailablePractitionerConfig {
  mode: 'priority' | 'random';
  calendar_order: string[];
}

/** Response shape from GET/PATCH /api/venue/feature-flags. */
export interface FeatureFlagsResponse {
  raw: VenueFeatureFlagsRaw;
  resolved: Record<string, boolean>;
  any_available_practitioner_config?: AnyAvailablePractitionerConfig;
  calendars?: FeatureFlagsCalendar[];
}

/** Local query key for the feature-flags GET, scoped under the venue namespace so
 *  the existing `queryKeys.venue.all()` invalidation (on PATCH) also refreshes it. */
export const featureFlagsQueryKeys = {
  detail: (accessToken?: string | null) =>
    [...queryKeys.venue.all(), 'featureFlags', keyScope(accessToken)] as const,
};

/**
 * GET /api/venue/feature-flags — resolved flags plus the any-available
 * practitioner config (with saved `calendar_order`) and the venue's bookable
 * `calendars` list, used to seed the priority reorder UI on the booking-settings
 * screen. The same endpoint also responds to PATCH (see useUpdateFeatureFlags).
 */
export function useFeatureFlags() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: featureFlagsQueryKeys.detail(accessToken),
    enabled,
    queryFn: async (): Promise<FeatureFlagsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<FeatureFlagsResponse>('/api/venue/feature-flags', {
        accessToken,
      });
    },
  });
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
    onSuccess: (res) => {
      // Seed the feature-flags cache from the PATCH response so the reorder UI
      // reflects the freshly-saved calendar_order immediately (the response
      // carries calendars + any_available_practitioner_config).
      queryClient.setQueryData(featureFlagsQueryKeys.detail(accessToken), res);
      // Invalidate venue bootstrap so feature_flags.resolved is refreshed everywhere.
      // This also re-validates the feature-flags detail key (same venue namespace).
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}

/**
 * Input to {@link useUpdateOpeningHours}: the weekly hours plus an optional
 * `acknowledge` flag. Narrowing hours can orphan upcoming bookings; the route
 * replies 409 `{ requires_confirmation, message }` unless the caller re-runs
 * with `acknowledge: true`, which threads `?acknowledge_affected_bookings=true`.
 */
export type UpdateOpeningHoursInput = OpeningHours & { acknowledge?: boolean };

/** PATCH /api/venue/opening-hours — replace weekly hours (admin only). */
export function useUpdateOpeningHours() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ acknowledge, ...hours }: UpdateOpeningHoursInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const path = acknowledge
        ? '/api/venue/opening-hours?acknowledge_affected_bookings=true'
        : '/api/venue/opening-hours';
      return apiFetch<unknown>(path, {
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
