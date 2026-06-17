import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  AccountLinksListResponse,
  AuditFilters,
  AuditResponse,
  CreateLinkPayload,
  IncomingLinksResponse,
  InviteCreateResponse,
  InviteVerifyResponse,
  LinkGrant,
  LinkGrantPair,
  LinkResponse,
  MyCalendarsResponse,
  RespondLinkAction,
  VenueLookupResponse,
  VenueSearchResponse,
} from '@/types/linked-venues';

/** GET /api/venue/account-links — all links + eligibility for the current venue (admin, Bearer). */
export function useLinkedVenues() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.linkedVenues.list(accessToken),
    enabled,
    queryFn: async (): Promise<AccountLinksListResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<AccountLinksListResponse>('/api/venue/account-links', { accessToken });
    },
  });
}

/** GET /api/venue/account-links/incoming — incoming requests + pending changes (banner feed). */
export function useIncomingLinks() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.linkedVenues.incoming(accessToken),
    enabled,
    queryFn: async (): Promise<IncomingLinksResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<IncomingLinksResponse>('/api/venue/account-links/incoming', { accessToken });
    },
  });
}

/**
 * PATCH /api/venue/account-links/[id] — respond to a pending request or cancel
 * your own pending request. Phase 1 covers `accept` / `reject` / `cancel`;
 * `accept_with_changes` (Phase 2) and the negotiated actions (Phase 3) carry an
 * optional `grants` pair in the body (required by the server for
 * `accept_with_changes` / `propose_change`).
 *
 * Not optimistic — a status transition is server-authoritative and the
 * partner's view must agree, so we show a pending spinner and invalidate the
 * list on settle rather than guessing the next state locally.
 */
export function useRespondLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      linkId: string;
      action: RespondLinkAction;
      /** Required for `accept_with_changes` / `propose_change`. */
      grants?: LinkGrantPair;
    }): Promise<LinkResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<LinkResponse>(`/api/venue/account-links/${input.linkId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ action: input.action, grants: input.grants }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedVenues.all() });
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 2 — send request + permission editor + invite/QR
// ---------------------------------------------------------------------------

/**
 * GET /api/venue/account-links/search?q= — venue search-by-name (also matches
 * slug). The component owns debouncing via the query key (re-keyed on the
 * trimmed term); the query only runs once the term is ≥2 chars. Results are
 * capped server-side (≤8) with a `truncated` flag.
 */
export function useVenueSearch(q: string) {
  const accessToken = useAccessToken();
  const term = q.trim();
  const enabled = isBackendConfigured() && accessToken !== null && term.length >= 2;

  return useQuery({
    queryKey: queryKeys.linkedVenues.search(accessToken, term),
    enabled,
    queryFn: async (): Promise<VenueSearchResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<VenueSearchResponse>(
        `/api/venue/account-links/search?q=${encodeURIComponent(term)}`,
        { accessToken },
      );
    },
  });
}

/** GET /api/venue/account-links/lookup?slug= — resolve a pasted booking-page slug. */
export function useVenueLookup(slug: string | null | undefined) {
  const accessToken = useAccessToken();
  const trimmed = slug?.trim().toLowerCase() ?? '';
  const enabled = isBackendConfigured() && accessToken !== null && trimmed.length > 0;

  return useQuery({
    queryKey: queryKeys.linkedVenues.lookup(accessToken, trimmed),
    enabled,
    queryFn: async (): Promise<VenueLookupResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<VenueLookupResponse>(
        `/api/venue/account-links/lookup?slug=${encodeURIComponent(trimmed)}`,
        { accessToken },
      );
    },
  });
}

/**
 * GET /api/venue/account-links/my-calendars — this venue's own calendars, for
 * the §18 "which of your calendars?" scope picker. Any staff role (not gated to
 * admins), so it's safe to fetch wherever the editor mounts.
 */
export function useMyCalendars() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.linkedVenues.myCalendars(accessToken),
    enabled,
    queryFn: async (): Promise<MyCalendarsResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<MyCalendarsResponse>('/api/venue/account-links/my-calendars', {
        accessToken,
      });
    },
  });
}

/**
 * POST /api/venue/account-links — send a new link request. Spinner + invalidate
 * on success (a new pending link must appear in the list); the caller surfaces
 * 409/429/cooldown errors inline.
 */
export function useSendLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateLinkPayload): Promise<LinkResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<LinkResponse>('/api/venue/account-links', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedVenues.all() });
    },
  });
}

/**
 * POST /api/venue/account-links/invite — mint a one-time, 30-day shareable
 * invite link (+ server-rendered QR data URL). Not cached: each call mints a
 * fresh token, so this is a mutation triggered when the invite sheet opens.
 */
export function useCreateInvite() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (): Promise<InviteCreateResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<InviteCreateResponse>('/api/venue/account-links/invite', {
        accessToken,
        method: 'POST',
      });
    },
  });
}

/**
 * GET /api/venue/account-links/invite?token= — verify a shareable invite token
 * (deep-link entry point) and resolve the initiating venue so the request sheet
 * can be pre-filled.
 */
export function useVerifyInvite(token: string | null | undefined) {
  const accessToken = useAccessToken();
  const trimmed = token?.trim() ?? '';
  const enabled = isBackendConfigured() && accessToken !== null && trimmed.length > 0;

  return useQuery({
    queryKey: queryKeys.linkedVenues.invite(accessToken, trimmed),
    enabled,
    queryFn: async (): Promise<InviteVerifyResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<InviteVerifyResponse>(
        `/api/venue/account-links/invite?token=${encodeURIComponent(trimmed)}`,
        { accessToken },
      );
    },
  });
}

/** DELETE /api/venue/account-links/[id] — unlink an accepted (or suspended) link. */
export function useUnlinkVenue() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string): Promise<{ ok: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean }>(`/api/venue/account-links/${linkId}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedVenues.all() });
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 3 — negotiation + unilateral grant/reduce + audit log
// ---------------------------------------------------------------------------

/**
 * POST /api/venue/account-links/[id]/grant — unilaterally EXPAND the access your
 * venue grants the other (increase-only; clears any pending change). Immediate,
 * needs no consent. The server validates increase-only; the caller gates the UI
 * via `classifyGrantChange`/`isIncreaseOnly`. Rate-limited 30/60s. Not optimistic
 * — a grant transition is server-authoritative, so spinner + invalidate on settle.
 */
export function useGrantAccess() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { linkId: string; grant: LinkGrant }): Promise<LinkResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<LinkResponse>(`/api/venue/account-links/${input.linkId}/grant`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ grant: input.grant }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedVenues.all() });
    },
  });
}

/**
 * POST /api/venue/account-links/[id]/reduce — unilaterally REDUCE the access your
 * venue grants the other (reduce-only). Immediate, needs no consent. Reducing to
 * zero-way is a 422 ("use Unlink instead"); the caller gates the UI via the pure
 * grant helpers. Rate-limited 30/60s.
 */
export function useReduceAccess() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { linkId: string; grant: LinkGrant }): Promise<LinkResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<LinkResponse>(`/api/venue/account-links/${input.linkId}/reduce`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ grant: input.grant }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.linkedVenues.all() });
    },
  });
}

/** Stable cache-key fragment for the audit filters (so a page/filter change re-keys). */
function auditFiltersKey(filters: AuditFilters): string {
  return [
    filters.page ?? 1,
    filters.pageSize ?? null,
    filters.action || null,
    filters.from || null,
    filters.to || null,
    filters.actingUserId || null,
  ].join('|');
}

/**
 * GET /api/venue/account-links/[id]/audit — paginated cross-venue audit log for a
 * link, with optional action / date / acting-user filters. View-only (no CSV on
 * mobile). `keepPreviousData` keeps the list visible while paging/filtering.
 */
export function useLinkedVenueAudit(linkId: string | null | undefined, filters: AuditFilters) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && !!linkId;
  const filtersKey = auditFiltersKey(filters);

  return useQuery({
    queryKey: queryKeys.linkedVenues.audit(accessToken, linkId, filtersKey),
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<AuditResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      if (!linkId) throw new Error('Missing link id');
      const qs = new URLSearchParams();
      qs.set('page', String(filters.page ?? 1));
      if (filters.pageSize) qs.set('pageSize', String(filters.pageSize));
      if (filters.action) qs.set('action', filters.action);
      if (filters.actingUserId) qs.set('actingUserId', filters.actingUserId);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      return apiFetch<AuditResponse>(
        `/api/venue/account-links/${linkId}/audit?${qs.toString()}`,
        { accessToken },
      );
    },
  });
}
