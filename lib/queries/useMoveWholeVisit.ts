import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { keyScope } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** Each live service of the visit with the version it was read at, sent back with the move. */
export type MoveWholeVisitExpected = { booking_id: string; updated_at: string }[];

/** Whether this person may move every business's services together (web split-visit plan 7.5). */
export interface MoveWholeVisitOption {
  can_move_all: boolean;
  /** Why not, in the server's words, when it is refused. */
  message: string | null;
  expected: MoveWholeVisitExpected;
}

/** The move: the opened service's new start; every service moves by the same amount. */
export interface MoveWholeVisitInput {
  anchor_booking_id: string;
  booking_date: string;
  /** HH:MM */
  booking_time: string;
  expected?: MoveWholeVisitExpected;
  /** Hold the client's notice back for the Notify / Don't notify / Undo prompt. */
  defer_modification_guest_notification?: boolean;
}

/**
 * Asks `POST /api/venue/bookings/{id}/move-whole-visit` with no date (web S28): whether this person
 * may move every business's services of a visit across businesses together. A "Can book and change"
 * diary role and a current link that allows changes over every calendar of each other part. Read
 * fresh each time the sheet opens; null while loading, on error and for a visit within one business.
 */
export function useMoveWholeVisitOption(bookingId: string | null | undefined, enabled: boolean) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['move-whole-visit-option', keyScope(accessToken), bookingId ?? null] as const,
    enabled: enabled && isBackendConfigured() && accessToken !== null && Boolean(bookingId),
    staleTime: 0,
    gcTime: 0,
    queryFn: () =>
      apiFetch<MoveWholeVisitOption>(`/api/venue/bookings/${encodeURIComponent(bookingId!)}/move-whole-visit`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({}),
      }),
  });
}

/**
 * Move whole visit, all businesses (web 7.5, S28): every business's services shift by the amount the
 * opened service moved, through the client's mover with staff rules. The other businesses get a bell;
 * the client one notice from the visit's lead (held back when deferred).
 */
export function useMoveWholeVisit(bookingId: string | null | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MoveWholeVisitInput) => {
      if (!accessToken) throw new Error('Missing access token');
      if (!bookingId) throw new Error('Missing booking id');
      return apiFetch<{ ok: true }>(`/api/venue/bookings/${encodeURIComponent(bookingId)}/move-whole-visit`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      if (bookingId) invalidateBookingCaches(queryClient, accessToken, bookingId);
    },
  });
}
