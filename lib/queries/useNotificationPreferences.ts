/**
 * Per-user push notification preferences, backed by
 * `user_profiles.notification_preferences` via GET/PATCH `/api/v1/me/profile`.
 *
 * The cache holds the RAW jsonb bag so unknown keys (written by other surfaces)
 * survive a write — each PATCH sends the full merged object because the backend
 * replaces the column wholesale.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { NotificationPreferences } from '@/types/notification-preferences';

type RawPrefs = Record<string, unknown>;

interface ProfileResponse {
  profile: { notification_preferences?: RawPrefs | null } | null;
}

const prefsQueryKey = (accessToken: string | null) =>
  [...queryKeys.notifications.all(), 'pushPrefs', keyScope(accessToken)] as const;

/** Load this user's raw notification-preferences bag. */
export function useNotificationPreferences() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: prefsQueryKey(accessToken),
    enabled,
    queryFn: async (): Promise<RawPrefs> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<ProfileResponse>('/api/v1/me/profile', { accessToken });
      return data.profile?.notification_preferences ?? {};
    },
  });
}

/** Patch one or more preference keys (optimistic; merges onto the cached bag). */
export function useUpdateNotificationPreferences() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const key = prefsQueryKey(accessToken);

  return useMutation({
    mutationFn: async (patch: Partial<NotificationPreferences>): Promise<RawPrefs> => {
      if (!accessToken) throw new Error('Missing access token');
      // Merge onto the current bag so unrelated keys are preserved (the API
      // replaces notification_preferences wholesale).
      const current = queryClient.getQueryData<RawPrefs>(key) ?? {};
      const merged = { ...current, ...patch };
      const data = await apiFetch<ProfileResponse>('/api/v1/me/profile', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ notification_preferences: merged }),
      });
      return data.profile?.notification_preferences ?? merged;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<RawPrefs>(key);
      queryClient.setQueryData<RawPrefs>(key, { ...(previous ?? {}), ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSuccess: (serverPrefs) => {
      queryClient.setQueryData(key, serverPrefs);
    },
  });
}
