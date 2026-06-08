import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import type { AppointmentCatalogResponse } from '@/types/appointment-catalog';

/**
 * Loads active services and practitioners for walk-in service selection.
 * Public route — no Bearer token required.
 */
export function useAppointmentCatalog(venueId: string | null | undefined) {
  const enabled = isBackendConfigured() && Boolean(venueId);

  return useQuery({
    queryKey: queryKeys.appointments.catalog(venueId),
    enabled,
    queryFn: async (): Promise<AppointmentCatalogResponse> => {
      if (!venueId) {
        throw new Error('Missing venue id');
      }
      const params = new URLSearchParams({ venue_id: venueId });
      return apiFetch<AppointmentCatalogResponse>(
        `/api/booking/appointment-catalog?${params.toString()}`,
      );
    },
  });
}
