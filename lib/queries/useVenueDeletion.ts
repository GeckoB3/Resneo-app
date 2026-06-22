import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

// ---------------------------------------------------------------------------
// Types — mirror the web `/api/venue/delete-request` routes.
// ---------------------------------------------------------------------------

/** GET /api/venue/delete-request response. */
export interface VenueDeletionStatus {
  /** The venue's display name (used to drive the type-to-confirm step). */
  venue_name: string;
  /** ISO timestamp the venue is scheduled to be permanently deleted, or null. */
  deletion_scheduled_at: string | null;
}

/** POST /api/venue/delete-request response. */
export interface VenueDeletionRequestResponse {
  deletion_scheduled_at: string | null;
  /** Optional human note (e.g. Stripe cancel could not be scheduled). */
  note: string | null;
}

// ---------------------------------------------------------------------------
// Query keys (local — keeps this danger-zone domain self-contained).
// ---------------------------------------------------------------------------

export const venueDeletionKeys = {
  all: ['venueDeletion'] as const,
  status: (accessToken?: string | null) =>
    [...venueDeletionKeys.all, 'status', keyScope(accessToken)] as const,
};

// ---------------------------------------------------------------------------
// GET /api/venue/delete-request — current scheduled-deletion state (admin-only).
// ---------------------------------------------------------------------------

/**
 * Reads the venue's scheduled-deletion state. Admin-only on the server (403
 * otherwise); pass `enabled = isAdmin` so non-admins never fire it. staleTime: 0
 * so the danger-zone card always reflects the live state on mount.
 */
export function useVenueDeletionStatus(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: venueDeletionKeys.status(accessToken),
    enabled: queryEnabled,
    staleTime: 0,
    gcTime: 30_000,
    queryFn: async (): Promise<VenueDeletionStatus> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<VenueDeletionStatus>('/api/venue/delete-request', { accessToken });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/venue/delete-request — schedule a 30-day grace-period deletion.
// ---------------------------------------------------------------------------

/**
 * Schedules the venue deletion. The server requires `confirmation` to exactly
 * match the venue name (case-insensitive) — the UI gates the button on that, and
 * the server re-validates. Invalidates the status query so the card flips to the
 * scheduled state.
 */
export function useRequestVenueDeletion() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (confirmation: string): Promise<VenueDeletionRequestResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<VenueDeletionRequestResponse>('/api/venue/delete-request', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: venueDeletionKeys.status(accessToken) });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/venue/delete-request/cancel — abort a scheduled deletion.
// ---------------------------------------------------------------------------

export interface VenueDeletionCancelResponse {
  ok: boolean;
}

/** Cancels a scheduled venue deletion (and resumes the subscription server-side). */
export function useCancelVenueDeletion() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<VenueDeletionCancelResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<VenueDeletionCancelResponse>('/api/venue/delete-request/cancel', {
        accessToken,
        method: 'POST',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: venueDeletionKeys.status(accessToken) });
    },
  });
}
