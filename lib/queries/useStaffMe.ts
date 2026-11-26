import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { rememberServerFeatures } from '@/lib/booking/book-once';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { StaffMeResponse } from '@/types/staff';

/**
 * Loads the signed-in user's staff profile (name, role, linked calendars).
 * Disabled until backend env vars and a Supabase session are present.
 */
export function useStaffMe() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.staff.me(accessToken),
    enabled,
    // The staff profile rarely changes mid-session — don't refetch every time
    // a screen mounts a new observer (it churned the app-level staff gate).
    staleTime: 5 * 60 * 1000,
    // The query key includes the access token, which Supabase rotates on its
    // periodic refresh. Without this, a refresh re-keys the query and empties
    // `data` until the refetch lands — long enough for the app-level staff gate
    // to read "no profile yet" and unmount the whole navigation Stack (it would
    // bounce a staff member out of an open screen, e.g. the new-booking modal,
    // back to the Calendar tab). Carrying the previous profile across the re-key
    // keeps the gate resolved through the refresh.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StaffMeResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const me = await apiFetch<StaffMeResponse>('/api/venue/staff/me', { accessToken });
      // Whether a timed-out create may be sent again with the same key (web P2.7).
      rememberServerFeatures(me);
      return me;
    },
  });
}
