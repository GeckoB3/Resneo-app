import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  LinkedNotificationPrefs,
  LinkedNotificationPrefsResponse,
  NotificationsResponse,
} from '@/types/notifications';
import { DEFAULT_LINKED_NOTIFICATION_PREFS } from '@/types/notifications';

/** Poll cadence for the notification feed + the More-tab unread badge — matches
 *  the web bell's 60s `setInterval` (`NotificationBell.tsx` `POLL_MS = 60_000`).
 *  A lightweight Supabase realtime subscription (postgres_changes INSERT on the
 *  notifications table, invalidating this key) remains a follow-up for
 *  seconds-latency cross-venue updates; the poll keeps the feed current today. */
const NOTIFICATIONS_POLL_MS = 60_000;

/** GET /api/venue/notifications — feed + unread count (Bearer). */
export function useNotifications() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.notifications.list(accessToken),
    enabled,
    // Keep the feed + tab badge current without user action (web parity).
    // Don't poll while the app is backgrounded — saves battery/data and avoids
    // refetch storms on resume.
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<NotificationsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<NotificationsResponse>('/api/venue/notifications?limit=50', { accessToken });
    },
  });
}

/** POST /api/venue/notifications/read — mark specific ids or all as read (with optimistic update). */
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
    onMutate: async (input) => {
      // Cancel any in-flight refetch so it doesn't overwrite our optimistic update.
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list(accessToken) });

      // Snapshot previous state for rollback.
      const previous = queryClient.getQueryData<NotificationsResponse>(
        queryKeys.notifications.list(accessToken),
      );

      // Apply optimistic update locally.
      if (previous) {
        const updated: NotificationsResponse = {
          ...previous,
          notifications: previous.notifications.map((n) => {
            if (input.all) return { ...n, read: true };
            if (input.ids?.includes(n.id)) return { ...n, read: true };
            return n;
          }),
          unreadCount: input.all
            ? 0
            : Math.max(
                0,
                previous.unreadCount - (input.ids?.filter(
                  (id) => previous.notifications.find((n) => n.id === id && !n.read),
                ).length ?? 0),
              ),
        };
        queryClient.setQueryData(queryKeys.notifications.list(accessToken), updated);
      }

      return { previous };
    },
    onError: (_err, _input, context) => {
      // Revert on error.
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.list(accessToken), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

// ---------------------------------------------------------------------------
// Linked Accounts email notification preferences (spec §17.4)
// ---------------------------------------------------------------------------

const notificationPrefsQueryKey = (accessToken: string | null) =>
  [...queryKeys.notifications.all(), 'prefs', keyScope(accessToken)] as const;

/** GET /api/venue/notifications/preferences — per-category email opt-in flags. */
export function useLinkedNotificationPrefs() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: notificationPrefsQueryKey(accessToken),
    enabled,
    queryFn: async (): Promise<LinkedNotificationPrefs> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<LinkedNotificationPrefsResponse>(
        '/api/venue/notifications/preferences',
        { accessToken },
      );
      return data.prefs ?? DEFAULT_LINKED_NOTIFICATION_PREFS;
    },
  });
}

/** PATCH /api/venue/notifications/preferences — update a single category toggle. */
export function useUpdateLinkedNotificationPrefs() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: Partial<LinkedNotificationPrefs>,
    ): Promise<LinkedNotificationPrefs> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<LinkedNotificationPrefsResponse>(
        '/api/venue/notifications/preferences',
        {
          accessToken,
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      );
      return data.prefs ?? DEFAULT_LINKED_NOTIFICATION_PREFS;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: notificationPrefsQueryKey(accessToken) });
      const previous = queryClient.getQueryData<LinkedNotificationPrefs>(
        notificationPrefsQueryKey(accessToken),
      );
      if (previous) {
        queryClient.setQueryData(notificationPrefsQueryKey(accessToken), {
          ...previous,
          ...input,
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationPrefsQueryKey(accessToken), context.previous);
      }
    },
    onSuccess: (serverPrefs) => {
      // Reconcile with server-authoritative response.
      queryClient.setQueryData(notificationPrefsQueryKey(accessToken), serverPrefs);
    },
  });
}
