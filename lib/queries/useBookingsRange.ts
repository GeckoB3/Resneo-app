import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingsListResponse } from '@/types/booking-list';

type UseBookingsRangeOptions = {
  /** Inclusive range start (YYYY-MM-DD). */
  from: string;
  /** Inclusive range end (YYYY-MM-DD). */
  to: string;
  enabled?: boolean;
};

/**
 * Loads bookings for a date range from GET /api/venue/bookings/list.
 *
 * NOTE: we deliberately do NOT pass `view=calendar` here. The list route strips
 * Cancelled rows from `view=calendar` responses unless a `status=Cancelled`
 * param is also sent — and since the app filters by status client-side, that
 * would make the Cancelled filter permanently empty in week/month/custom scope.
 * The full list shape is a superset of the calendar fields, so nothing else
 * changes. (Web's own range fetch also omits `view=calendar`.)
 */
export function useBookingsRange(options: UseBookingsRangeOptions) {
  const accessToken = useAccessToken();
  const { from, to } = options;
  const queryEnabled =
    (options.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.bookings.range(accessToken, from, to),
    enabled: queryEnabled,
    queryFn: async (): Promise<BookingsListResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({
        from,
        to,
      });
      return apiFetch<BookingsListResponse>(`/api/venue/bookings/list?${params}`, {
        accessToken,
      });
    },
  });
}
