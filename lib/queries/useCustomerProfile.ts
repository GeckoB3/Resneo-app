import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Where a person who could land on either side would rather land.
 *
 * The web has offered this for months on `/account/profile`, so a customer who
 * has already told ResNeo "take me to my account" should not have to say it
 * again on their phone. Reading the existing column beats inventing a parallel
 * app-only preference that then disagrees with the web.
 *
 * `'ask'` means the person wants to be asked. C1 treats it as `'dashboard'` and
 * offers the switcher instead of building a chooser screen, which is a
 * simplification recorded here rather than hidden: an ask-me-every-time screen
 * is a real design, and it is not what this phase is for.
 */
export type LoginDestination = 'account' | 'dashboard' | 'ask';

export interface CustomerProfile {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  default_login_destination: LoginDestination | null;
  /** Free-form bag shared with the staff app. Read through the matrix helpers. */
  notification_preferences?: Record<string, unknown> | null;
}

interface ProfileResponse {
  profile: CustomerProfile | null;
  user: { id?: string; email?: string | null } | null;
}

/**
 * The caller's own profile, from the customer surface.
 *
 * `/api/v1/me/profile`, which is one of the 18 routes that carries a v1 alias.
 * Bearer-authenticated and scoped server-side from the session: there is no id
 * to pass and no way to ask about anybody else.
 *
 * **This answers for staff too**, which is the point. A venue's staff member is
 * also a person who books things elsewhere, and this route does not care which
 * they are; it reads `user_profiles`, which every signed-in user has.
 */
export function useCustomerProfile() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.customer.profile(accessToken),
    enabled,
    // The routing decision waits on this, so a refresh that re-keys the query
    // must not momentarily empty it and send a settled user back to the loading
    // screen. Same reasoning as `useStaffMe`, and for the same reason: the
    // answer feeds a navigator choice.
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ProfileResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ProfileResponse>('/api/v1/me/profile', { accessToken });
    },
  });
}

export interface ProfilePatch {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  default_login_destination?: LoginDestination | null;
  notification_preferences?: Record<string, unknown>;
}

/**
 * Save part of the profile.
 *
 * **Send only what changed.** The route MERGES into a free-form jsonb column
 * that the staff app writes to as well, so a client posting its whole idea of
 * the profile overwrites whatever it did not know about. That is not
 * hypothetical: the web fixed exactly this, where a customer client sending its
 * own two keys erased every staff push preference on the row, and linked
 * accounts actively create users who have both.
 */
export function useUpdateCustomerProfile() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch('/api/v1/me/profile', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
    },
  });
}
