import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';

function invalidateBookingCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
  // Keep the calendar grid in sync after status/reschedule changes.
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
}

/**
 * PATCH /api/venue/bookings/[id] — update booking status (Confirm, Seated, etc.).
 */
export function useUpdateBookingStatus(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: BookingStatus): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: (data) => {
      if (accessToken) {
        queryClient.setQueryData(queryKeys.bookings.detail(accessToken, bookingId), data);
      }
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * Cancel a booking via PATCH { status: 'Cancelled' }.
 * (DELETE on this route permanently removes an already-cancelled booking — not used for cancel.)
 */
export function useCancelBooking(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
    },
    onSuccess: (data) => {
      if (accessToken) {
        queryClient.setQueryData(queryKeys.bookings.detail(accessToken, bookingId), data);
      }
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * PATCH /api/venue/bookings/[id] — move a booking to a new date/time (reschedule).
 * The backend validates availability and returns an error on conflict.
 */
export function useRescheduleBooking(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { date: string; time: string }): Promise<BookingDetail> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ booking_date: input.date, booking_time: input.time }),
      });
    },
    onSuccess: (data) => {
      if (accessToken) {
        queryClient.setQueryData(queryKeys.bookings.detail(accessToken, bookingId), data);
      }
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * DELETE /api/venue/bookings/[id] — permanently remove a cancelled booking.
 */
export function useDeleteBooking(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      if (accessToken) {
        queryClient.removeQueries({
          queryKey: queryKeys.bookings.detail(accessToken, bookingId),
        });
      }
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}
