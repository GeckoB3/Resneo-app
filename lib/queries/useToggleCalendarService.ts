import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * PUT /api/venue/practitioner-services — replace the full set of service links
 * for ONE calendar (Bearer via B2). Used by the non-admin staff "Offer on your
 * calendars" toggle: the API replaces all links for `practitioner_id` with
 * `service_ids`, so the caller must send the COMPLETE next set for that calendar
 * (add/remove one id from the existing set). Backend scopes non-admins to
 * calendars they manage.
 *
 * Removing a service that still has upcoming bookings on that calendar is
 * allowed — those bookings stay exactly where they are and only new ones stop —
 * but the route asks first: 409 with the affected bookings listed, then the same
 * save carried through by `acknowledge` (web #194).
 *
 * @see C:\Resneo\src\app\api\venue\practitioner-services\route.ts (PUT)
 */
export interface ToggleCalendarServiceInput {
  /** A `practitioners.id` (or `unified_calendars.id` for unified venues). */
  practitioner_id: string;
  /** The complete next set of service ids offered on that calendar. */
  service_ids: string[];
  /** Threads `?acknowledge_affected_bookings=true`: save despite the bookings left behind. */
  acknowledge?: boolean;
}

export function useToggleCalendarService() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      acknowledge,
      ...input
    }: ToggleCalendarServiceInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const path = acknowledge
        ? '/api/venue/practitioner-services?acknowledge_affected_bookings=true'
        : '/api/venue/practitioner-services';
      return apiFetch<unknown>(path, {
        accessToken,
        method: 'PUT',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      // The service list carries the practitioner_services links the toggle edits.
      void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
    },
  });
}

/**
 * Compute the next `service_ids` set for a calendar when toggling one service
 * on/off, given the calendar's current set. Pure — shared with the screen + its
 * tests. Mirrors the web `toggleStaffServiceCalendar` set maths.
 */
export function nextCalendarServiceIds(
  currentServiceIds: string[],
  serviceId: string,
  nextEnabled: boolean,
): string[] {
  if (nextEnabled) {
    return Array.from(new Set([...currentServiceIds, serviceId]));
  }
  return currentServiceIds.filter((id) => id !== serviceId);
}
