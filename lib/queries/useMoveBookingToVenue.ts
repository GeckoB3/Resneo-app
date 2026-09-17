import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface MoveBookingToVenueInput {
  bookingId: string;
  /** The raw calendar id at the other venue (never a `linked:` column key). */
  calendarId: string;
  bookingDate: string;
  /** HH:mm */
  bookingTime: string;
}

export interface MoveBookingToVenueResult {
  ok: true;
  booking_id: string;
  venue_id: string;
  venue_name: string;
  guest_notified: boolean;
}

/**
 * POST /api/venue/bookings/{id}/move-venue (web D46, revised 2026-09-16).
 *
 * Moves a booking to a calendar at another venue of the same live collective in one step: the other
 * venue gets its own booking at the same price, the original is cancelled quietly, and the client is
 * sent one message from the new venue. A booking with a deposit, card hold, payment or completed
 * form, or that is part of a visit or group, is refused with 409 and a sentence
 * (`COLLECTIVE_MOVE_ATTACHED`, `COLLECTIVE_MOVE_SERVICE`, `COLLECTIVE_MOVE_TIME`,
 * `COLLECTIVE_MOVE_NOT_ALLOWED`), which the caller shows as it is.
 */
export function useMoveBookingToVenue() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MoveBookingToVenueInput): Promise<MoveBookingToVenueResult> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<MoveBookingToVenueResult>(`/api/venue/bookings/${input.bookingId}/move-venue`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({
          calendar_id: input.calendarId,
          booking_date: input.bookingDate,
          booking_time: input.bookingTime.slice(0, 5),
        }),
      });
    },
    onSuccess: (result, input) => {
      invalidateBookingCaches(queryClient, accessToken, input.bookingId);
      invalidateBookingCaches(queryClient, accessToken, result.booking_id);
    },
  });
}
