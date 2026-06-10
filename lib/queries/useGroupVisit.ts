import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Row returned by GET /api/venue/bookings/list?group_booking_id=… — the other
 * bookings sharing a visit (multi-service visit) or group (people visit).
 * @see _reference/Resneo/src/lib/booking/group-visit-bookings.ts
 */
export interface GroupVisitBookingRow {
  id: string;
  booking_date?: string;
  booking_time: string | null;
  booking_end_time?: string | null;
  status: string;
  person_label?: string | null;
  booking_item_name?: string | null;
  service_variant_name?: string | null;
  booking_addon_labels?: string[];
  addons_total_duration_minutes?: number | null;
  group_booking_id?: string | null;
  guest_name?: string;
}

/**
 * All bookings sharing a `group_booking_id` — sorted by start time. Powers the
 * "Services in this visit" and "Group booking" cards (web parity).
 */
export function useGroupVisitBookings(groupBookingId: string | null | undefined) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.bookings.groupVisit(accessToken, groupBookingId),
    enabled: isBackendConfigured() && accessToken !== null && !!groupBookingId,
    queryFn: async (): Promise<GroupVisitBookingRow[]> => {
      if (!accessToken || !groupBookingId) {
        throw new Error('Missing group visit parameters');
      }
      const response = await apiFetch<{ bookings?: GroupVisitBookingRow[] }>(
        `/api/venue/bookings/list?group_booking_id=${encodeURIComponent(groupBookingId)}`,
        { accessToken },
      );
      return [...(response.bookings ?? [])].sort((a, b) =>
        (a.booking_time ?? '').localeCompare(b.booking_time ?? ''),
      );
    },
  });
}
