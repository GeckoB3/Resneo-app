import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { GuestDetailResponse } from '@/types/guest-detail';

type UseGuestDetailOptions = {
  bookingHistoryLimit?: number;
};

/**
 * GET /api/venue/guests/[guestId] — profile, stats, booking history and communications.
 */
export function useGuestDetail(
  guestId: string | null | undefined,
  options: UseGuestDetailOptions = {},
) {
  const accessToken = useAccessToken();
  const bookingHistoryLimit = options.bookingHistoryLimit ?? 80;
  const enabled =
    isBackendConfigured() && accessToken !== null && Boolean(guestId);

  return useQuery({
    queryKey: queryKeys.guests.detail(accessToken, guestId, bookingHistoryLimit),
    enabled,
    queryFn: async (): Promise<GuestDetailResponse> => {
      if (!accessToken || !guestId) {
        throw new Error('Missing access token or guest id');
      }
      const params = new URLSearchParams({
        booking_history_limit: String(bookingHistoryLimit),
      });
      return apiFetch<GuestDetailResponse>(
        `/api/venue/guests/${guestId}?${params.toString()}`,
        { accessToken },
      );
    },
  });
}
