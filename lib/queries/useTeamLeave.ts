import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { PractitionerLeaveResponse } from '@/types/availability-manage';

/**
 * Query keys for the team leave calendar — defined locally (keys.ts is frozen).
 * Rooted under `queryKeys.availabilityManage.all()` so the existing
 * create/update/delete leave mutations in useAvailabilityManage (which
 * invalidate that prefix) automatically refetch these month queries too.
 */
export const teamLeaveKeys = {
  month: (
    accessToken: string | null,
    from: string,
    to: string,
    practitionerId: string | null,
  ) =>
    [
      ...queryKeys.availabilityManage.all(),
      'teamLeaveMonth',
      accessToken ?? null,
      from,
      to,
      practitionerId,
    ] as const,
};

/**
 * GET /api/venue/practitioner-leave?from=&to= (Bearer) — whole-team leave for
 * one calendar month, color-coded by leave type on the availability page.
 *
 * Server scoping (verified in the web route, which uses
 * `createVenueRouteClient(request)` and therefore accepts Bearer tokens):
 * admins see every calendar in the venue; non-admin staff see the calendars
 * linked to their account.
 */
export function useTeamLeaveMonth(
  from: string,
  to: string,
  practitionerId?: string | null,
) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: teamLeaveKeys.month(accessToken, from, to, practitionerId ?? null),
    enabled,
    queryFn: async (): Promise<PractitionerLeaveResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to });
      if (practitionerId) params.set('practitioner_id', practitionerId);
      return apiFetch<PractitionerLeaveResponse>(
        `/api/venue/practitioner-leave?${params}`,
        { accessToken },
      );
    },
  });
}
