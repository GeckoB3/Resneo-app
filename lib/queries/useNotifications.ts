import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { NotificationsResponse } from '@/types/notifications';

/** GET /api/venue/notifications — feed + unread count (Bearer). */
export function useNotifications() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.notifications.list(accessToken),
    enabled,
    queryFn: async (): Promise<NotificationsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<NotificationsResponse>('/api/venue/notifications?limit=50', { accessToken });
    },
  });
}

/** POST /api/venue/notifications/read — mark specific ids or all as read. */
export function useMarkNotificationsRead() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { ids?: string[]; all?: true }): Promise<{ ok: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ ok: boolean }>('/api/venue/notifications/read', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}
