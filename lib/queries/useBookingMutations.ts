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
  // Keep the calendar grid + run-sheet in sync after status/reschedule changes.
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.daySheet.all() });
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

export type GuestMessageChannel = 'email' | 'sms' | 'both';

export interface SendBookingMessageResult {
  success: boolean;
  errors?: string[];
}

/**
 * POST /api/venue/bookings/[id]/message — send a custom message to the guest.
 * Invalidates the detail so the new communication shows on the timeline.
 */
export function useSendBookingMessage(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      message: string;
      channel: GuestMessageChannel;
    }): Promise<SendBookingMessageResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<SendBookingMessageResult>(`/api/venue/bookings/${bookingId}/message`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/**
 * POST /api/venue/bookings/[id]/resend-confirmation — re-send the booking
 * confirmation email/SMS (requires the guest to have an email on file).
 */
export function useResendConfirmation(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(
        `/api/venue/bookings/${bookingId}/resend-confirmation`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

export type DepositAction = 'send_payment_link' | 'waive' | 'record_cash' | 'refund';

/**
 * POST /api/venue/bookings/[id]/deposit — deposit actions: send a payment link,
 * waive, record a cash payment, or refund. Invalidates the booking on success.
 */
export function useBookingDeposit(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      action: DepositAction;
      amount_pence?: number;
    }): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${bookingId}/deposit`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}

/** Editable guest-contact + notes fields on PATCH /api/venue/bookings/[id]. */
export interface UpdateBookingDetailsInput {
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  special_requests?: string | null;
  dietary_notes?: string | null;
  internal_notes?: string | null;
  occasion?: string | null;
}

/**
 * PATCH /api/venue/bookings/[id] — edit guest contact details and booking notes.
 * The route returns the raw booking row (not the enriched detail), so we
 * invalidate to refetch the full detail rather than seeding the cache.
 */
export function useUpdateBookingDetails(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBookingDetailsInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/bookings/${bookingId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
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
