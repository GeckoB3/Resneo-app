/**
 * Calendar quick-action mutations — accept the bookingId as part of the
 * mutationFn input so a single hook instance can service any booking on
 * the calendar grid (unlike useUpdateBookingStatus which binds to a single id).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingStatus } from '@/types/booking-detail';

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
  // Class/event/resource blocks render from the separate schedule feed, and a
  // status/arrival change can clear a waitlist offer — refresh both so a tray
  // action isn't stale until the 60s poll (parity with invalidateBookingCaches).
  void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
}

/**
 * PATCH /api/venue/bookings/[id] — quick status change from the calendar block tray.
 * bookingId is passed in the input so a single mutation instance serves all blocks.
 */
export function useCalendarStatusAction() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      status: BookingStatus;
      /**
       * The unpaid-promotion acknowledgement (`lib/booking/accept-unpaid.ts`).
       * Sent only as the replay after staff answer the guard sheet.
       */
      accept_unpaid?: true;
    }) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch(`/api/venue/bookings/${input.bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({
          status: input.status,
          ...(input.accept_unpaid ? { accept_unpaid: true } : {}),
        }),
      });
    },
    onSuccess: (_data, variables) => {
      invalidate(queryClient, accessToken, variables.bookingId);
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] — quick arrival toggle from the calendar block tray.
 */
export function useCalendarArrivalAction() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { bookingId: string; client_arrived: boolean }) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch(`/api/venue/bookings/${input.bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ client_arrived: input.client_arrived }),
      });
    },
    onSuccess: (_data, variables) => {
      invalidate(queryClient, accessToken, variables.bookingId);
    },
  });
}
