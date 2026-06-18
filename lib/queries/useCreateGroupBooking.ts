import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { CreateGroupPayload } from '@/lib/booking/multi-service-chain';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { GroupedBookingResponse } from '@/lib/queries/useCreateMultiServiceBooking';

/**
 * Creates a group appointment booking — multiple distinct attendees, one
 * organiser contact, linked by a single group_booking_id.
 *
 * Mirrors the web staff `AppointmentBookingFlow` group flow, which posts the
 * public `/api/booking/create-group` route with `source: 'phone' | 'walk-in'`.
 * Like multi-service, the entire group is one server call: the backend validates
 * each attendee's slot (injecting earlier attendees as phantom bookings to catch
 * overlaps), runs the per-attendee compliance gate, inserts N linked rows, and
 * (if any deposit is owed) opens ONE Stripe PaymentIntent for the summed amount.
 * Partial-failure rollback is the server's responsibility.
 */
export function useCreateGroupBooking() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateGroupPayload): Promise<GroupedBookingResponse> => {
      return apiFetch<GroupedBookingResponse>('/api/booking/create-group', {
        ...(accessToken ? { accessToken } : {}),
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
    },
  });
}
