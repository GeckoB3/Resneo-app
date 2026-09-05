import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { StaffCollectiveResponse } from '@/types/linked-venues';

/**
 * GET /api/venue/staff-collective (web 2026-09-04): the live venue collective
 * the caller's venue books for as one business, if any, with the member venues
 * and the calendars its combined catalogue offers.
 *
 * The calendar tab reads it to decide where a New booking goes: a slot on a
 * column that is one of these calendars, own or partner's, opens the booking
 * form for the collective with that calendar preselected; the toolbar's New
 * and Walk-in open it over the whole collective; a column outside the
 * collective keeps the per-venue form (`collectiveBookingTargetFor`).
 *
 * Only a venue with linked calendars can be a member (membership needs full
 * mutual write links), so callers gate `enabled` on the linked feed rather than
 * asking for every venue. Served with the catalogue's cache headers; a minute
 * of staleness is fine, since membership changes are rare and the routes
 * re-check it on every create.
 */
export function useStaffCollective(options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && (options?.enabled ?? true);

  return useQuery({
    queryKey: queryKeys.staffCollective.current(accessToken),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StaffCollectiveResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<StaffCollectiveResponse>('/api/venue/staff-collective', { accessToken });
    },
  });
}
