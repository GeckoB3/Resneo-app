import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

export interface UseAppointmentCatalogOptions {
  /**
   * When true, passes include_hidden=true so staff-only addon groups (hidden_from_online=true)
   * are returned. Requires a valid access token.
   */
  includeHidden?: boolean;
}

/**
 * Loads active services and practitioners for walk-in service selection.
 * Public route; pass includeHidden=true for staff to see hidden addon groups.
 *
 * The Bearer token always goes with the request when there is one. The route
 * ignores it for the catalog itself (and honours `include_hidden` only for the
 * caller's own venue), but since web 2026-09-03 the public-booking billing
 * guard reads it: a linked venue whose plan blocks online booking answered the
 * app's linked-calendar "New booking" with the public's "Online booking is
 * temporarily unavailable" because this call carried no session. With the
 * token, staff of the venue or of a partner with booking rights are let through.
 */
export function useAppointmentCatalog(
  venueId: string | null | undefined,
  options: UseAppointmentCatalogOptions = {},
) {
  const { includeHidden = false } = options;
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && Boolean(venueId);

  return useQuery({
    queryKey: [...queryKeys.appointments.catalog(venueId), includeHidden] as const,
    enabled,
    queryFn: async (): Promise<AppointmentCatalogResponse> => {
      if (!venueId) {
        throw new Error('Missing venue id');
      }
      const params = new URLSearchParams({ venue_id: venueId });
      if (includeHidden) {
        params.set('include_hidden', 'true');
      }
      return apiFetch<AppointmentCatalogResponse>(
        `/api/booking/appointment-catalog?${params.toString()}`,
        accessToken ? { accessToken } : {},
      );
    },
  });
}
