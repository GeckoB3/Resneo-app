import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface VenueRelationship {
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
 * **Notably absent: the guest id.** The route returns the relationship without
 * it, and `PATCH /api/account/marketing-preferences` requires one, so marketing
 * consent is readable from the app and not writable. That is recorded rather
 * than worked around: adding `guest_id` to this response is a one-line,
 * additive web change, and making it is a decision for the web repo rather than
 * something to smuggle in from here.
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
