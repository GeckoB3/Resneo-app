import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface VenueRelationship {
  /**
   * The caller's guest row at this venue.
   *
   * `PATCH /api/account/marketing-preferences` identifies a relationship by
   * this, so without it consent was readable and not writable. Added to the
   * route on 2026-08-31 for exactly that reason.
   */
  guest_id: string;
  venue_id: string;
  venue_name: string | null;
  first_booked_at: string | null;
  last_booked_at: string | null;
  total_bookings_count: number | null;
  marketing_consent: boolean | null;
  marketing_consent_at: string | null;
  marketing_opt_out: boolean | null;
}

/**
 * One row per venue the customer is known at.
 *
 * Carries `guest_id`, which is what makes marketing consent writable. It was
 * absent when C4 was built, so that section shipped read-only and pointed at
 * the website; the web added the field on 2026-08-31 and the toggle followed.
 */
export function useCustomerVenueRelationships(enabled = true) {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: queryKeys.customer.venues(accessToken),
    enabled: isBackendConfigured() && accessToken !== null && enabled,
    queryFn: async (): Promise<{ venues: VenueRelationship[] }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ venues: VenueRelationship[] }>('/api/v1/me/venues', { accessToken });
    },
  });
}
