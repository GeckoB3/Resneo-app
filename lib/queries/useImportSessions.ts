import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * One row from `GET /api/import/sessions`. Shape mirrors the web `ImportHub`
 * `SessionRow` plus the extra columns the route selects
 * (`C:\Resneo\src\app\api\import\sessions\route.ts`):
 *   id, status, detected_platform, total_rows, imported_clients,
 *   imported_bookings, skipped_rows, updated_existing, undo_available_until,
 *   undone_at, created_at, completed_at, ai_mapping_used.
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
}

export interface ImportSessionsResponse {
  sessions: ImportSessionRow[];
}

/**
 * AUTH NOTE (Domain 05, R7): `GET /api/import/sessions` and the undo POST are
 * gated by `requireImportAdmin()` → `createClient()` (cookie-only) on the
 * backend, with NO `Authorization: Bearer` support. The app authenticates
 * exclusively via Bearer, so these endpoints currently answer 401 from mobile.
 * This is treated as an EXPECTED state, not an error: the venue-profile surface
 * shows a read-only "manage on the web" fallback when the list can't load with a
 * Bearer token. If the route is later migrated to `createRouteHandlerClient*`
 * (Bearer-capable), the same hook will start returning data with no UI change.
 *
 * `isAuthGap` lets the UI distinguish "not reachable with a Bearer token"
 * (401/403) from a genuine fetch failure (network/5xx → retry makes sense).
 */
export function isAuthGap(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/** GET /api/import/sessions — read-only recent imports (admin; cookie-only backend, see note). */
export function useImportSessions(options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled =
    (options?.enabled ?? true) && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.all, 'importSessions', keyScope(accessToken)] as const,
    enabled,
    staleTime: 30_000,
    // The auth gap (401/403) is deterministic — never retry it; one attempt is
    // enough to fall back to the web link-out. Network/5xx still get one retry.
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
 * POST /api/import/sessions/[id]/undo — revert a completed import within 24h.
 *
 * Exposed for completeness, but the same cookie-only auth gap applies: the
 * route uses `requireImportAdmin()` (no Bearer), so this will 401 from the app.
 * The venue-profile UI therefore renders Undo as a web link-out rather than
 * calling this directly. Wired here so a future Bearer migration is a one-line
 * UI change.
 */
export function useUndoImportSession() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<{ ok: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ ok: boolean }>(
        `/api/import/sessions/${encodeURIComponent(sessionId)}/undo`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.all, 'importSessions', keyScope(accessToken)],
      });
      // A successful undo reverts created guests/bookings — refresh those too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
    },
  });
}
