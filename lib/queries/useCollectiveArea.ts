/**
 * The Collective area's requests (web `/dashboard/collective`, 2026-09-17). Every route is
 * admin-only and takes the app's Bearer token (`resolveLinkAdmin` reads the Authorization header).
 *
 *   services + calendars   GET  /api/venue/appointment-services  (`collective_calendars` for a host)
 *   save                   POST /api/venue/collectives/[id]/bulk  (up to 200 changes, one answer each)
 *   preview                POST /api/venue/collectives/[id]/bulk/preview
 *   try again              POST /api/venue/collectives/[id]/replicas/retry
 *   history                GET  /api/venue/collectives/[id]/history
 *   hosting and members    PATCH /api/venue/collectives/[id]/members
 */
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Platform, Share } from 'react-native';

import { ApiError, apiFetch } from '@/lib/api/client';
import type {
  BulkOp,
  BulkOpResult,
  HistoryFilter,
  HistoryPage,
  PreviewVenue,
} from '@/lib/collective-area/model';
import { getApiUrl, isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** The route's limit per request, and the client's progress unit. */
export const BULK_CHUNK = 200;

function useInvalidateArea() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.staffCollective.all() });
    void queryClient.invalidateQueries({ queryKey: ['collectiveHistory'] });
  };
}

/**
 * Save staged changes, 200 at a time. A refused chunk reports every change in it as not done, so
 * nothing is quietly dropped (web `CollectiveAreaClient.commit`).
 */
export function useCollectiveBulkSave(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateArea();
  return useMutation({
    mutationFn: async (ops: BulkOp[]): Promise<BulkOpResult[]> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const all: BulkOpResult[] = [];
      for (let start = 0; start < ops.length; start += BULK_CHUNK) {
        const chunk = ops.slice(start, start + BULK_CHUNK);
        try {
          const data = await apiFetch<{ results?: BulkOpResult[] }>(
            `/api/venue/collectives/${collectiveId}/bulk`,
            { accessToken, method: 'POST', body: JSON.stringify({ ops: chunk }) },
          );
          for (const result of data.results ?? []) all.push({ ...result, index: result.index + start });
        } catch (err) {
          const message = err instanceof ApiError ? err.message : 'That save did not go through.';
          chunk.forEach((_op, index) => all.push({ index: index + start, ok: false, message }));
        }
      }
      return all;
    },
    onSettled: invalidate,
  });
}

export function useCollectiveBulkPreview(collectiveId: string | null) {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (ops: BulkOp[]): Promise<PreviewVenue[]> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const data = await apiFetch<{ venues?: PreviewVenue[] }>(
        `/api/venue/collectives/${collectiveId}/bulk/preview`,
        { accessToken, method: 'POST', body: JSON.stringify({ ops }) },
      );
      return data.venues ?? [];
    },
  });
}

/** Bring one venue up to date again (the collective's one Retry). */
export function useCollectiveRetry(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateArea();
  return useMutation({
    mutationFn: async (venueId: string): Promise<unknown> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      return apiFetch(`/api/venue/collectives/${collectiveId}/replicas/retry`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ venue_id: venueId }),
      });
    },
    onSettled: invalidate,
  });
}

/**
 * Moving the hosting and managing members (web `hostingAction` and the Venues tab): any body the
 * members route takes, e.g. `offer_host`, `cancel_host_transfer`, `accept_host`, `decline_host`,
 * `take_over_hosting`, `remove`.
 */
export function useCollectiveMembersPatch(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateArea();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<unknown> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      return apiFetch(`/api/venue/collectives/${collectiveId}/members`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSettled: invalidate,
  });
}

export interface HistoryQuery {
  filter: HistoryFilter;
  venueId: string | null;
  /** YYYY-MM-DD, a whole day in the phone's time zone. */
  from: string | null;
  to: string | null;
}

/** The history's query string, a date being a whole day from its first moment to its last. */
export function historyParams(q: HistoryQuery, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ filter: q.filter, limit: '50', ...extra });
  if (q.venueId) params.set('venue_id', q.venueId);
  if (q.from) params.set('from', new Date(`${q.from}T00:00:00`).toISOString());
  if (q.to) params.set('to', new Date(`${q.to}T23:59:59.999`).toISOString());
  return params.toString();
}

export function useCollectiveHistory(collectiveId: string | null, q: HistoryQuery, enabled = true) {
  const accessToken = useAccessToken();
  return useInfiniteQuery({
    queryKey: ['collectiveHistory', keyScope(accessToken), collectiveId, q],
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!collectiveId,
    initialPageParam: null as string | null,
    getNextPageParam: (last: HistoryPage) => last.next_cursor ?? undefined,
    queryFn: async ({ pageParam }): Promise<HistoryPage> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const query = historyParams(q, pageParam ? { cursor: pageParam } : {});
      return apiFetch<HistoryPage>(`/api/venue/collectives/${collectiveId}/history?${query}`, { accessToken });
    },
  });
}

/**
 * "Download this history": the web route's CSV, written to a file and handed to the share sheet
 * (the pattern of Reports' data export).
 */
export async function shareHistoryCsv(
  accessToken: string,
  collectiveId: string,
  collectiveName: string,
  q: HistoryQuery,
): Promise<void> {
  const url = `${getApiUrl()}/api/venue/collectives/${collectiveId}/history?${historyParams(q, { format: 'csv' })}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/csv' } });
  if (!response.ok) {
    let message = 'Could not download the history. Please try again.';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Not JSON: keep the plain message.
    }
    throw new Error(message);
  }
  const csv = await response.text();
  const filename = `${collectiveName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'collective'}-history.csv`;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as {
      cacheDirectory: string | null;
      writeAsStringAsync: (uri: string, text: string) => Promise<void>;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as {
      isAvailableAsync: () => Promise<boolean>;
      shareAsync: (uri: string, options: Record<string, string>) => Promise<void>;
    };
    if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
      const uri = `${FileSystem.cacheDirectory ?? ''}${filename}`;
      await FileSystem.writeAsStringAsync(uri, csv);
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        dialogTitle: filename,
        UTI: 'public.comma-separated-values-text',
      });
      return;
    }
  } catch {
    // Fall back to sharing the text itself.
  }
  await Share.share({ title: filename, message: csv });
}
