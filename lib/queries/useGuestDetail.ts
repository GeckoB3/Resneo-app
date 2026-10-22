import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { GuestBookingHistoryRow, GuestDetailResponse } from '@/types/guest-detail';

type UseGuestDetailOptions = {
  bookingHistoryLimit?: number;
};

/**
 * A "Hidden" person's view of someone else's visit (roles plan §5.11, UR20) arrives with only its
 * date, model, labels, who it was with, the service and the status. The fields every history list
 * reads are filled with empty values here, so sorting and grouping keep working; the row stays
 * `restricted` and is never opened.
 */
export function normalizeGuestHistoryRow(row: GuestBookingHistoryRow): GuestBookingHistoryRow {
  if (!row.restricted) return row;
  const partial = row as Partial<GuestBookingHistoryRow> & Pick<GuestBookingHistoryRow, 'id' | 'restricted'>;
  return {
    ...partial,
    id: row.id,
    restricted: true,
    booking_date: partial.booking_date ?? '',
    booking_time: partial.booking_time ?? '',
    party_size: partial.party_size ?? null,
    status: partial.status ?? '',
    deposit_status: partial.deposit_status ?? null,
    deposit_amount_pence: partial.deposit_amount_pence ?? null,
    booking_model: partial.booking_model ?? '',
    kind_label: partial.kind_label ?? '',
    detail_label: partial.detail_label ?? '',
    practitioner_name: partial.practitioner_name ?? null,
    service_name: partial.service_name ?? null,
    area_name: partial.area_name ?? null,
  };
}

/** The guest detail with its history rows made safe to list (see `normalizeGuestHistoryRow`). */
export function normalizeGuestDetail(detail: GuestDetailResponse): GuestDetailResponse {
  const history = detail.booking_history;
  if (!Array.isArray(history) || !history.some((row) => row?.restricted)) return detail;
  return { ...detail, booking_history: history.map(normalizeGuestHistoryRow) };
}

/** GET /api/venue/guests/[guestId], as every reader of the guest detail cache fetches it. */
export async function fetchGuestDetail(
  guestId: string,
  bookingHistoryLimit: number,
  accessToken: string,
): Promise<GuestDetailResponse> {
  const params = new URLSearchParams({ booking_history_limit: String(bookingHistoryLimit) });
  const detail = await apiFetch<GuestDetailResponse>(`/api/venue/guests/${guestId}?${params.toString()}`, {
    accessToken,
  });
  return normalizeGuestDetail(detail);
}

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
      return fetchGuestDetail(guestId, bookingHistoryLimit, accessToken);
    },
  });
}
