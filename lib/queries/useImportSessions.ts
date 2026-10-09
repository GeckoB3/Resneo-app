import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import type { ImportUndoSummary } from '@/lib/import/undo-summary';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * One row from `GET /api/import/sessions`. Shape mirrors the web `ImportHub`
 * `SessionRow` plus the extra columns the route selects
 * (`C:\Resneo\src\app\api\import\sessions\route.ts`).
 */
export interface ImportSessionRow {
  id: string;
  status: string;
  detected_platform: string | null;
  total_rows: number | null;
  imported_clients: number | null;
  imported_bookings: number | null;
  skipped_rows: number | null;
  updated_existing: number | null;
  undo_available_until: string | null;
  undone_at: string | null;
  created_at: string;
  completed_at: string | null;
  ai_mapping_used: boolean | null;
  /** What an Undo of this import kept on purpose, when it kept anything (QA G-33). */
  undo_summary?: ImportUndoSummary | null;
  /** An Undo stopped part-way: the counts no longer describe what is in the venue. */
  undo_incomplete?: boolean;
}

export interface ImportSessionsResponse {
  sessions: ImportSessionRow[];
}

/**
 * AUTH: every `/api/import/**` route takes the app's Bearer token (the web's
 * `requireImportAdmin` builds its client from `createRouteHandlerClientFromHeaders`)
 * and is admin only. A 403 here means the signed-in staff member is not an admin;
 * a 401 that survives the refresh-and-retry means the session is gone. Both are
 * deterministic, so neither is retried, and screens say so rather than "try again".
 */
export function isAuthGap(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function importSessionsKey(accessToken: string | null) {
  return [...queryKeys.all, 'importSessions', keyScope(accessToken)] as const;
}

/** GET /api/import/sessions: past imports, newest first (admin). */
export function useImportSessions(options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled =
    (options?.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: importSessionsKey(accessToken),
    enabled,
    staleTime: 30_000,
    // 401/403 are deterministic: one attempt. Network/5xx still get one retry.
    retry: (failureCount, error) => !isAuthGap(error) && failureCount < 1,
    queryFn: async (): Promise<ImportSessionsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ImportSessionsResponse>('/api/import/sessions', { accessToken });
    },
  });
}

/**
 * POST /api/import/sessions/[id]/undo: take out a completed import within 24 hours.
 * The answer carries what was kept on purpose (`undo_summary`). The list is refreshed
 * whether or not it worked: an Undo that stopped part-way has still changed it (QA G-33).
 */
export function useUndoImportSession() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      sessionId: string,
    ): Promise<{ ok: boolean; undo_summary?: ImportUndoSummary | null }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ ok: boolean; undo_summary?: ImportUndoSummary | null }>(
        `/api/import/sessions/${encodeURIComponent(sessionId)}/undo`,
        { accessToken, method: 'POST', timeoutMs: 120_000 },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: importSessionsKey(accessToken) });
      // An undo reverts created clients and bookings: refresh those too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    },
  });
}

/** POST /api/import/sessions: start a new import. Answers the new session's id. */
export function useStartImportSession() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ id: string; status: string }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ id: string; status: string }>('/api/import/sessions', {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importSessionsKey(accessToken) });
    },
  });
}

/**
 * DELETE /api/import/sessions/[id]: take an import off the list and delete its uploaded
 * files. Clients and bookings it already wrote stay (Undo is what removes those).
 */
export function useDeleteImportSession() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<{ ok: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ ok: boolean }>(`/api/import/sessions/${encodeURIComponent(sessionId)}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: importSessionsKey(accessToken) });
    },
  });
}
