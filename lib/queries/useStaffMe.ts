import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
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
    queryFn: async (): Promise<StaffMeResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<StaffMeResponse>('/api/venue/staff/me', { accessToken });
    },
  });
}
