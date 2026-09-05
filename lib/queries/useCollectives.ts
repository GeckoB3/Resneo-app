/**
 * Venue Collectives (combined / shared booking pages) — query + mutation hooks
 * (Phase 5). All routes are admin-only + Bearer. Mutations always invalidate the
 * collectives namespace on settle: the server auto-reconciles members (removing
 * write-ineligible venues, transferring host, dissolving <2-member collectives),
 * so we re-fetch the authoritative CollectiveView rather than mutating the cache
 * locally (plan §16 risk 7).
 *
 * See Docs/LINKED_VENUES_IMPLEMENTATION_PLAN.md §2.6 / Appendix B.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  CatalogueActionPayload,
  CatalogueResponse,
  CollectiveMemberActionPayload,
  CollectiveResponse,
  CollectivesListResponse,
  CreateCollectivePayload,
  PageAssetKind,
  PageAssetResponse,
  SlugAvailableResponse,
  UpdateCollectivePayload,
} from '@/types/collectives';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** GET /api/venue/collectives — every collective this venue hosts or belongs to. */
export function useCollectives(options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && (options?.enabled ?? true);

  return useQuery({
    queryKey: queryKeys.collectives.list(accessToken),
    enabled,
    queryFn: async (): Promise<CollectivesListResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CollectivesListResponse>('/api/venue/collectives', { accessToken });
    },
  });
}

/** GET /api/venue/collectives/[id]/catalogue — the host catalogue builder view. */
export function useCollectiveCatalogue(collectiveId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!collectiveId;

  return useQuery({
    queryKey: queryKeys.collectives.catalogue(accessToken, collectiveId ?? null),
    enabled,
    queryFn: async (): Promise<CatalogueResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      if (!collectiveId) throw new Error('Missing collective id');
      return apiFetch<CatalogueResponse>(
        `/api/venue/collectives/${collectiveId}/catalogue`,
        { accessToken },
      );
    },
  });
}

/**
 * GET /api/venue/collectives/slug-available?slug= — debounced (400ms) booking-page
 * address availability check. Returns `null` (no result yet) for an empty slug.
 */
export function useSlugAvailable(slug: string) {
  const accessToken = useAccessToken();
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const trimmed = slug.trim().toLowerCase();
    const handle = setTimeout(() => setDebounced(trimmed), 400);
    return () => clearTimeout(handle);
  }, [slug]);

  const enabled = isBackendConfigured() && accessToken !== null && debounced.length > 0;

  return useQuery({
    queryKey: queryKeys.collectives.slug(accessToken, debounced),
    enabled,
    queryFn: async (): Promise<SlugAvailableResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<SlugAvailableResponse>(
        `/api/venue/collectives/slug-available?slug=${encodeURIComponent(debounced)}`,
        { accessToken },
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** POST /api/venue/collectives — create a collective + invite eligible venues. */
export function useCreateCollective() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCollectivePayload): Promise<CollectiveResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CollectiveResponse>('/api/venue/collectives', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    },
  });
}

/** PATCH /api/venue/collectives/[id] — name / branding / address / page config. */
export function useUpdateCollective() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      payload: UpdateCollectivePayload;
    }): Promise<CollectiveResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CollectiveResponse>(`/api/venue/collectives/${input.collectiveId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input.payload),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    },
  });
}

/** DELETE /api/venue/collectives/[id] — dissolve the collective (tombstones slug). */
export function useDissolveCollective() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectiveId: string): Promise<{ ok: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean }>(`/api/venue/collectives/${collectiveId}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    },
  });
}

/**
 * PATCH /api/venue/collectives/[id]/members — invite / accept / decline / leave /
 * remove / configure / transfer_host. The server may auto-reconcile (transfer
 * host, dissolve), so we re-fetch the list rather than trusting local state.
 */
export function useCollectiveMemberAction() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      payload: CollectiveMemberActionPayload;
    }): Promise<CollectiveResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CollectiveResponse>(
        `/api/venue/collectives/${input.collectiveId}/members`,
        {
          accessToken,
          method: 'PATCH',
          body: JSON.stringify(input.payload),
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    },
  });
}

/**
 * PATCH /api/venue/collectives/[id]/catalogue — create_item / update_item /
 * archive_item / add_provider / remove_provider. Rate-limited 60/60s server-side.
 * Seeds the catalogue cache from the response and invalidates so the list refreshes.
 */
export function useCatalogueAction() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      payload: CatalogueActionPayload;
    }): Promise<CatalogueResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<CatalogueResponse>(
        `/api/venue/collectives/${input.collectiveId}/catalogue`,
        {
          accessToken,
          method: 'PATCH',
          body: JSON.stringify(input.payload),
        },
      );
    },
    onSuccess: (data, variables) => {
      // Seed the catalogue cache from the authoritative response so the builder
      // reflects the change immediately (the PATCH returns the full view).
      if (data.catalogue) {
        queryClient.setQueryData(
          queryKeys.collectives.catalogue(accessToken, variables.collectiveId),
          (prev: CatalogueResponse | undefined) => ({
            catalogue: data.catalogue,
            importSources: data.importSources ?? prev?.importSources,
          }),
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.collectives.catalogue(accessToken, variables.collectiveId),
      });
    },
  });
}

/**
 * POST /api/venue/collectives/[id]/page-asset?kind= — multipart upload of a logo /
 * cover / gallery / offering / team image (≤5MB). RN sends a `{ uri, name, type }`
 * object as the FormData file; `apiFetch` skips the JSON Content-Type for FormData
 * so the platform sets the multipart boundary. Returns the stored URL.
 */
export function useUploadPageAsset() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      kind: PageAssetKind;
      uri: string;
      mimeType: string;
    }): Promise<string> => {
      if (!accessToken) throw new Error('Missing access token');
      const form = new FormData();
      const ext =
        input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg';
      form.append('file', {
        uri: input.uri,
        name: `upload.${ext}`,
        type: input.mimeType,
      } as unknown as Blob);

      // apiFetch supports FormData (no forced JSON Content-Type), but the
      // page-asset route's `kind` lives in the query string.
      const res = await apiFetch<PageAssetResponse>(
        `/api/venue/collectives/${input.collectiveId}/page-asset?kind=${input.kind}`,
        {
          accessToken,
          method: 'POST',
          body: form,
        },
      );
      if (!res.url) throw new Error('No URL returned from upload');
      return res.url;
    },
  });
}

/** DELETE /api/venue/collectives/[id]/page-asset?kind= — remove a stored asset by URL. */
export function useDeletePageAsset() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      kind: PageAssetKind;
      url: string;
    }): Promise<{ ok: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean }>(
        `/api/venue/collectives/${input.collectiveId}/page-asset?kind=${input.kind}`,
        {
          accessToken,
          method: 'DELETE',
          body: JSON.stringify({ url: input.url }),
        },
      );
    },
  });
}

// Re-export the picker so collective screens can mirror the booking-page editor's
// image-picker mechanism without importing from the venue-image module directly.
export { pickVenueImage } from '@/lib/queries/useVenueImageUpload';
