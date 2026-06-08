import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingDetail } from '@/types/booking-detail';

/**
 * Loads full booking detail. Prefetches the lightweight /summary route for faster first paint.
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
      queryKey: queryKeys.bookings.detail(accessToken, bookingId),
      queryFn: async (): Promise<BookingDetail> =>
        apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}/summary`, { accessToken }),
    });
  }, [accessToken, bookingId, enabled, queryClient]);

  return useQuery({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId ?? null),
    enabled,
    // Summary prefetch may populate cache first — always fetch full detail afterward.
    staleTime: 0,
    queryFn: async (): Promise<BookingDetail> => {
      if (!accessToken || !bookingId) {
        throw new Error('Missing access token or booking id');
      }
      return apiFetch<BookingDetail>(`/api/venue/bookings/${bookingId}`, { accessToken });
    },
  });
}
