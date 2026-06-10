import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  NotificationSettingsPatch,
  VenueNotificationSettings,
} from '@/types/communications';

/** GET /api/venue/notification-settings — merged settings (Bearer). */
export function useNotificationSettings() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.communications.notificationSettings(accessToken),
    enabled,
    queryFn: async (): Promise<VenueNotificationSettings> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<VenueNotificationSettings>('/api/venue/notification-settings', {
        accessToken,
      });
    },
  });
}

/** PUT /api/venue/notification-settings — partial merge (admin only). */
export function useUpdateNotificationSettings() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: NotificationSettingsPatch): Promise<VenueNotificationSettings> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<VenueNotificationSettings>('/api/venue/notification-settings', {
        accessToken,
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.communications.notificationSettings(accessToken), data);
    },
  });
}
