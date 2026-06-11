import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  CommunicationPreviewRequest,
  CommunicationPreviewResponse,
  NotificationSettingsPatch,
  VenueCommunicationPolicies,
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

/**
 * GET /api/venue/communication-policies — per-message guest-communication
 * policies (the web "Guest communications" section).
 */
export function useCommunicationPolicies() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.communications.policies(accessToken),
    enabled,
    queryFn: async (): Promise<VenueCommunicationPolicies> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<VenueCommunicationPolicies>('/api/venue/communication-policies', {
        accessToken,
      });
    },
  });
}

/**
 * PUT /api/venue/communication-policies — admin only. The server merges the
 * patch into the stored map, so send only the lanes/messages that changed.
 */
export function useUpdateCommunicationPolicies() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: VenueCommunicationPolicies): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/communication-policies', {
        accessToken,
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.communications.policies(accessToken),
      });
    },
  });
}

/**
 * POST /api/venue/communication-preview — renders a message preview.
 * Used by PreviewBottomSheet to show email HTML or SMS text.
 */
export function usePreviewCommunication() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (req: CommunicationPreviewRequest): Promise<CommunicationPreviewResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CommunicationPreviewResponse>('/api/venue/communication-preview', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(req),
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
