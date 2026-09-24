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
import { formDataFile } from '@/lib/api/form-data-file';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  AdoptionReview,
  AdoptionsResponse,
  CatalogueActionPayload,
  CatalogueResponse,
  CollectiveMemberActionPayload,
  CollectiveResponse,
  CollectivesListResponse,
  CreateCollectivePayload,
  JoinPreview,
  PageAssetKind,
  PageAssetResponse,
  SameNameMatch,
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
 * PATCH /api/venue/collectives/[id]/catalogue — create_item(s) / update_item /
 * archive_item / add_provider / remove_provider / set_providers, and the
 * service-sync actions (sync_provider / detach_provider / link_provider /
 * sync_all_providers / unlink_all_providers, web #187 + #190). Rate-limited
 * 60/60s server-side.
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
            // Only the GET carries the live team (F-2); keep it until the refetch.
            team: data.team ?? prev?.team,
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
      form.append('file', formDataFile(input.uri, `upload.${ext}`, input.mimeType));

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

// ---------------------------------------------------------------------------
// Joining on shared services, same names and adoptions (web plan L4, L13)
// ---------------------------------------------------------------------------

/**
 * GET /api/venue/collectives/[id]/join: what an invited venue has to decide before it joins.
 * `withPendingLink` reviews the invitation together with the link request it rides on (web
 * plan L4), when the mesh is not there yet.
 */
export function useJoinPreview(
  collectiveId: string | null | undefined,
  options?: { withPendingLink?: boolean; enabled?: boolean },
) {
  const accessToken = useAccessToken();
  const withPendingLink = options?.withPendingLink === true;
  const enabled =
    isBackendConfigured() && accessToken !== null && Boolean(collectiveId) && (options?.enabled ?? true);

  return useQuery({
    queryKey: queryKeys.collectives.joinPreview(accessToken, collectiveId, withPendingLink),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<JoinPreview> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      return apiFetch<JoinPreview>(
        `/api/venue/collectives/${collectiveId}/join${withPendingLink ? '?with_pending_link=1' : ''}`,
        { accessToken },
      );
    },
  });
}

/** GET /api/venue/collectives/[id]/same-names (host): who holds a same-named service, by host service id. */
export function useSameNames(collectiveId: string | null | undefined, options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled =
    isBackendConfigured() && accessToken !== null && Boolean(collectiveId) && (options?.enabled ?? true);

  return useQuery({
    queryKey: queryKeys.collectives.sameNames(accessToken, collectiveId),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, SameNameMatch[]>> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const res = await apiFetch<{ matches?: Record<string, SameNameMatch[]> }>(
        `/api/venue/collectives/${collectiveId}/same-names`,
        { accessToken },
      );
      return res.matches ?? {};
    },
  });
}

/** GET /api/venue/collectives/[id]/adoptions (member): the host's open questions about same-named services. */
export function useAdoptions(collectiveId: string | null | undefined, options?: { enabled?: boolean }) {
  const accessToken = useAccessToken();
  const enabled =
    isBackendConfigured() && accessToken !== null && Boolean(collectiveId) && (options?.enabled ?? true);

  return useQuery({
    queryKey: queryKeys.collectives.adoptions(accessToken, collectiveId),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AdoptionsResponse> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      return apiFetch<AdoptionsResponse>(`/api/venue/collectives/${collectiveId}/adoptions`, { accessToken });
    },
  });
}

/** GET /api/venue/collectives/[id]/adoptions/[itemId]: one question with both sides' options. */
export function useAdoptionReview(collectiveId: string | null | undefined, itemId: string | null | undefined) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && Boolean(collectiveId) && Boolean(itemId);

  return useQuery({
    queryKey: queryKeys.collectives.adoptionReview(accessToken, collectiveId, itemId),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<AdoptionReview> => {
      if (!accessToken || !collectiveId || !itemId) throw new Error('Missing access token');
      return apiFetch<AdoptionReview>(`/api/venue/collectives/${collectiveId}/adoptions/${itemId}`, { accessToken });
    },
  });
}

/** POST /api/venue/collectives/[id]/adoptions/[itemId]: use my service, or keep it separate (web contract 10). */
export function useAnswerAdoption() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      itemId: string;
      choice: 'use_mine' | 'keep_separate';
      optionMap?: { my_variant_id: string; host_variant_id: string | null }[];
    }): Promise<{ ok: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean }>(`/api/venue/collectives/${input.collectiveId}/adoptions/${input.itemId}`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ choice: input.choice, option_map: input.optionMap ?? [] }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
    },
  });
}

