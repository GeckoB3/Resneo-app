import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { Practitioner, PractitionersResponse } from '@/types/practitioner';

type UsePractitionersOptions = {
  /** Linked-venue context, when acting on a partner venue's roster. */
  ownerVenueId?: string | null;
  enabled?: boolean;
  /**
   * Include RESOURCE calendar columns in the roster.
   *
   * Off by default, because almost every caller is picking a calendar to put a
   * booking or a staff member on, and a resource is neither. The exception is
   * the Calendar availability screen: a resource is a `unified_calendars` row
   * like any other and its weekly hours are the same `working_hours` column
   * (`/api/venue/resources` only ALIASES it as `availability_hours`), so
   * excluding it there is what forced a second hours editor to exist.
   *
   * Mechanically this drops `staff_assignable=1`, which is the flag the web
   * route filters `calendar_type = 'resource'` on.
   */
  includeResources?: boolean;
};

/**
 * Loads the venue's bookable calendar columns (practitioners) for the calendar
 * grid. Asks for the full active, staff-assignable roster.
 */
export function usePractitioners(options: UsePractitionersOptions = {}) {
  const accessToken = useAccessToken();
  const ownerVenueId = options.ownerVenueId ?? null;
  const includeResources = options.includeResources ?? false;
  const queryEnabled =
    (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.practitioners.list(accessToken, ownerVenueId, includeResources),
    enabled: queryEnabled,
    queryFn: async (): Promise<PractitionersResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ roster: '1', active_only: '1' });
      if (!includeResources) {
        params.set('staff_assignable', '1');
      }
      if (ownerVenueId) {
        params.set('owner_venue_id', ownerVenueId);
      }
      return apiFetch<PractitionersResponse>(`/api/venue/practitioners?${params}`, {
        accessToken,
      });
    },
  });
}

/**
 * POST /api/venue/practitioners — create a new bookable calendar column (admin
 * only, Bearer). Shared by the classes / events / resources editors' inline
 * "Add calendar" so a fresh venue (or one needing a new column) never has to
 * leave the app. Returns the created column (so the caller can select it
 * immediately); the plan calendar-limit surfaces as a 403 `ApiError`
 * (`upgrade_required`). Callers should also add the returned column to their
 * local option list optimistically — `useHostCalendars` and the classes GET use
 * their own keys, so the broad invalidation here is best-effort freshness.
 */
export function useCreateHostCalendar() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string }): Promise<Practitioner> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<Practitioner>('/api/venue/practitioners', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({
          name: input.name.trim(),
          calendar_type: 'practitioner',
          is_active: true,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.practitioners.all() });
      // Classes/resources derive calendar columns from venue + bookings feeds.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    },
  });
}
