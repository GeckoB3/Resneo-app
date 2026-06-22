import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingPageConfig } from '@/lib/booking/bookingPageConfig';

/** A bookable team member for the "Meet the team" editor. */
export interface BookingPageTeamMember {
  id: string;
  name: string;
}

interface BookingPageTeamResponse {
  team: BookingPageTeamMember[];
}

/**
 * GET /api/venue/booking-page-team — the bookable members shown on the public
 * "Meet the team" tab (Bearer; admin). Per-member bio/photo/specialties/hidden
 * are stored separately in `booking_page_config.team_profiles`.
 */
export function useBookingPageTeam(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.venue.all(), 'bookingPageTeam', keyScope(accessToken)] as const,
    enabled: queryEnabled,
    queryFn: async (): Promise<BookingPageTeamMember[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const data = await apiFetch<BookingPageTeamResponse>('/api/venue/booking-page-team', {
        accessToken,
      });
      return data.team ?? [];
    },
  });
}

/**
 * PATCH /api/venue with `{ booking_page_config }` — the server merges the
 * incoming keys onto the stored JSONB and re-sanitises it (admin only, Bearer).
 *
 * Send a FULL config build (the editor's current state) on every save: the
 * server merge is key-by-key (`{ ...existing, ...incoming }` then sanitise), so
 * a field omitted from `incoming` keeps its previous value. To CLEAR a colour /
 * text / social field, send it as `null` (the sanitiser drops it); tab + cover
 * flags are booleans (never null).
 *
 * Mirrors `useServicesManage.ts`: `apiFetch` + `useAccessToken`, then
 * invalidates `queryKeys.venue.all()` so the venue bootstrap (which carries
 * `booking_page_config`) refreshes everywhere.
 */
export function useUpdateBookingPageConfig() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (booking_page_config: BookingPageConfig): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ booking_page_config }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() });
    },
  });
}
