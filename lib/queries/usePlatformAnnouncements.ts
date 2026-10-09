/**
 * Platform announcements: the dismissible banners ResNeo shows across the venue dashboard
 * (maintenance windows, new features). Web parity with `PlatformAnnouncementBanners.tsx`,
 * loaded in `src/app/dashboard/layout.tsx` by `loadActiveAnnouncementsForUser`.
 *
 *   GET  /api/announcements           `{ announcements: ActiveAnnouncement[] }`, the caller's
 *                                     active, in-window, undismissed announcements
 *   POST /api/announcements/dismiss   `{ announcement_id }`, for the caller only
 *
 * NOTE (web follow-up): today the web loads announcements in its server layout only, so it has
 * no GET route, and the dismiss route reads the cookie session (`createClient`), not a Bearer
 * token. Until both exist the read finds nothing and the banners stay hidden; nothing errors.
 * The tables are RLS-closed, so the app cannot read them directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export type AnnouncementSeverity = 'info' | 'warning' | 'critical';

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
}

/** The pill on each banner, as on the web. */
export const ANNOUNCEMENT_PILL_LABEL: Record<AnnouncementSeverity, string> = {
  info: 'Announcement',
  warning: 'Important',
  critical: 'Critical',
};

/** Keeps only well-formed rows; an unknown severity reads as info, as the web's loader does. */
export function normaliseAnnouncements(raw: unknown): ActiveAnnouncement[] {
  const list = (raw as { announcements?: unknown } | null)?.announcements;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => {
    const r = row as Partial<ActiveAnnouncement> | null;
    if (!r || typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.body !== 'string') return [];
    const severity: AnnouncementSeverity =
      r.severity === 'warning' || r.severity === 'critical' ? r.severity : 'info';
    return [{ id: r.id, title: r.title, body: r.body, severity }];
  });
}

export const announcementKeys = {
  active: (accessToken: string | null) =>
    [...queryKeys.dashboard.all(), 'platformAnnouncements', keyScope(accessToken)] as const,
};

export function usePlatformAnnouncements() {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: announcementKeys.active(accessToken),
    enabled: isBackendConfigured() && accessToken !== null,
    // The web reads them once per dashboard load; five minutes keeps Today and More in step
    // without asking on every tab switch.
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ActiveAnnouncement[]> => {
      if (!accessToken) throw new Error('Missing access token');
      try {
        return normaliseAnnouncements(await apiFetch<unknown>('/api/announcements', { accessToken }));
      } catch {
        // A banner is never worth an error state: a failed read shows none, as the web layout does.
        return [];
      }
    },
  });
}

/**
 * Dismisses one for this person. It disappears at once on every screen; if saving fails it is
 * back on the next read, exactly as the web ("the dismissal will retry on next page load").
 */
export function useDismissAnnouncement() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: true }>('/api/announcements/dismiss', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ announcement_id: announcementId }),
      });
    },
    onMutate: (announcementId) => {
      queryClient.setQueryData<ActiveAnnouncement[]>(announcementKeys.active(accessToken), (prev) =>
        (prev ?? []).filter((a) => a.id !== announcementId),
      );
    },
  });
}
