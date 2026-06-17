import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingDetail } from '@/types/booking-detail';

/**
 * Loads full booking detail. Prefetches the lightweight /summary route for faster
 * first paint — but under its OWN cache key, surfaced only via `placeholderData`.
 * If the summary shared the full-detail key, a status mutation's `seedDetailFromRow`
 * (which merges a bare PATCH row onto whatever is cached) could land on the partial
 * summary base and strand the nested guest/timeline fields until the next refetch.
 * Keeping the summary on a separate key guarantees the full-detail key is only ever
 * populated by the full fetch (or a merge onto a full base).
 */
export function useBookingDetail(bookingId: string | undefined) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(bookingId);

  useEffect(() => {
    if (!enabled || !bookingId || !accessToken) {
      return;
    }

    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.bookings.detail(accessToken, bookingId), 'summary'],
      queryFn: async (): Promise<BookingDetail> =>
        apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}/summary`, { accessToken }),
    });
  }, [accessToken, bookingId, enabled, queryClient]);

  return useQuery({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId ?? null),
    enabled,
    // Summary prefetch lives on its own key — show it for first paint without ever
    // writing it to the full-detail key.
    placeholderData: () =>
      accessToken && bookingId
        ? queryClient.getQueryData<BookingDetail>([
            ...queryKeys.bookings.detail(accessToken, bookingId),
            'summary',
          ])
        : undefined,
    staleTime: 0,
    queryFn: async (): Promise<BookingDetail> => {
      if (!accessToken || !bookingId) {
        throw new Error('Missing access token or booking id');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, { accessToken });
    },
  });
}
