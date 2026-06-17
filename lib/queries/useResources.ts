import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { PractitionersResponse } from '@/types/practitioner';

/**
 * Local query keys for the resources day view. Kept here (not in
 * lib/queries/keys.ts) — same `reserveNI` root so auth-scoped cache clearing
 * still covers these entries.
 */
export const resourceQueryKeys = {
  all: () => [...queryKeys.all, 'resources'] as const,
  list: (accessToken?: string | null) =>
    [...resourceQueryKeys.all(), 'list', accessToken ?? null] as const,
  dayBookings: (accessToken?: string | null, date?: string | null) =>
    [...resourceQueryKeys.all(), 'dayBookings', accessToken ?? null, date ?? null] as const,
};

/**
 * A bookable resource (court, room, bay…). Resources are `unified_calendars`
 * rows with `calendar_type === 'resource'` — the same id space `bookings.resource_id`
 * points at, so this id can be matched directly against booking rows.
 */
export interface ResourceListItem {
  id: string;
  name: string;
  /** Hex colour staff picked for the calendar column, when set. */
  colour: string | null;
  is_active: boolean;
  sort_order: number;
}

/**
 * Loads the venue's bookable resources for the day view (name/colour/active only).
 *
 * This deliberately reads GET /api/venue/practitioners?roster=1, which returns
 * every unified calendar (including resource columns) — enough for the day-view
 * column list and cheaper than the full record. It is NOT an auth limitation:
 * GET /api/venue/resources is Bearer-capable (`createVenueRouteClient`) and
 * `useResourcesManageList` (lib/queries/useResourcesManage.ts) uses it for the
 * full shape (slot grid, pricing, payment, weekly hours) in the editing flow.
 */
export function useResourcesList() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: resourceQueryKeys.list(accessToken),
    enabled,
    queryFn: async (): Promise<ResourceListItem[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const data = await apiFetch<PractitionersResponse>('/api/venue/practitioners?roster=1', {
        accessToken,
      });
      return (data.practitioners ?? [])
        .filter((p) => p.calendar_type === 'resource')
        .map((p) => ({
          id: p.id,
          name: p.name,
          colour: p.colour ?? null,
          is_active: p.is_active,
          sort_order: p.sort_order ?? 0,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    },
  });
}

/**
 * Booking row subset used by the resources day view. The list route returns
 * far more — these are the fields the per-resource list renders. Includes
 * `resource_id`/`booking_end_time`, which the shared {@link BookingListRow}
 * type does not carry.
 */
export interface ResourceDayBookingRow {
  id: string;
  booking_date: string;
  booking_time: string | null;
  booking_end_time: string | null;
  status: string;
  guest_name: string;
  party_size: number;
  deposit_status: string | null;
  deposit_amount_pence?: number | null;
  /** Set for resource bookings; legacy rows may carry the id in calendar_id instead. */
  resource_id?: string | null;
  calendar_id?: string | null;
  /** Resolved label, e.g. the resource/service name ("Court 1"). */
  booking_item_name?: string | null;
}

interface ResourceDayBookingsResponse {
  bookings: ResourceDayBookingRow[];
}

/**
 * Loads one day's bookings from GET /api/venue/bookings/list?date= (Bearer ✓).
 *
 * The route has no server-side resource filter for "all resources at once"
 * (its `resource_id` query param is ignored; `calendar=` filters to a single
 * id) — the web page also filters client-side. One request covers every
 * resource for the day; the screen groups rows by `resource_id`.
 */
export function useResourceDayBookings(date: string) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: resourceQueryKeys.dayBookings(accessToken, date),
    enabled,
    queryFn: async (): Promise<ResourceDayBookingRow[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ date });
      const data = await apiFetch<ResourceDayBookingsResponse>(
        `/api/venue/bookings/list?${params}`,
        { accessToken },
      );
      return data.bookings ?? [];
    },
  });
}
