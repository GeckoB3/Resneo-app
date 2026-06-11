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
 * Public route by default; pass includeHidden=true for staff to see hidden addon groups.
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
        includeHidden && accessToken ? { accessToken } : {},
      );
    },
  });
}
