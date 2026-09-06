/**
 * A partner's guest's bookings at the partner's venue, for the guest history
 * on a linked booking's panel (web `GuestBookingsForGuestAccordion` with
 * `historyVenueId`): `GET /api/venue/bookings/list` in its guest-history mode
 * with `owner_venue_id`, which the server answers for a full-details link,
 * redacting the client's details unless the link shares them. Our own guests
 * route does not know a partner's client, so this is the one read for it.
 */
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingsListResponse } from '@/types/booking-list';

/** Under `bookings.all()`, so every booking write's invalidation refreshes it. */
export const linkedGuestHistoryKey = (
  accessToken: string | null,
  ownerVenueId: string | null | undefined,
  guestId: string | null | undefined,
) =>
  [
    ...queryKeys.bookings.all(),
    'linkedGuestHistory',
    keyScope(accessToken),
    ownerVenueId ?? null,
    guestId ?? null,
  ] as const;

export function useLinkedGuestHistory(
  ownerVenueId: string | null | undefined,
  guestId: string | null | undefined,
) {
  const accessToken = useAccessToken();
  const enabled =
    isBackendConfigured() && accessToken !== null && Boolean(ownerVenueId) && Boolean(guestId);

  return useQuery({
    queryKey: linkedGuestHistoryKey(accessToken, ownerVenueId, guestId),
    enabled,
    queryFn: async (): Promise<BookingsListResponse> => {
      if (!accessToken || !ownerVenueId || !guestId) {
        throw new Error('Missing linked guest history parameters');
      }
      const params = new URLSearchParams({
        guest: guestId,
        guest_history: '1',
        owner_venue_id: ownerVenueId,
      });
      return apiFetch<BookingsListResponse>(`/api/venue/bookings/list?${params.toString()}`, {
        accessToken,
      });
    },
  });
}
