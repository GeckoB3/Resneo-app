/**
 * Curating a collective's page from every venue's own services, with nobody asked (owner,
 * 2026-10-27; web `VenueServicesPanel.tsx`, `SuggestionsReview.tsx`, `MemberSuggestPanel.tsx`).
 * Every route takes the app's Bearer token and is admin-only (`resolveLinkAdmin`).
 *
 *   Every venue's services   GET  /api/venue/collectives/[id]/venue-services  (the host: every
 *                                 venue's, its own first; a member: its own, to suggest from)
 *   Put on / take off        POST /api/venue/collectives/[id]/venue-services
 *                                 { action: 'add' | 'remove', items: [{ venue_id, service_id }], mode? }
 *                                 (the host; 200 at a time, one result per service)
 *   Suggest many             POST /api/venue/collectives/[id]/suggestions  { service_ids }  (a member)
 *   Leave many off           POST /api/venue/collectives/[id]/suggestions/decline  { service_ids }  (the host)
 *
 * A server from before 2026-10-27 has no venue-services route and answers 404. `useVenueServices`
 * then answers null rather than failing, and every screen that reads it keeps what it did before.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch, isApiErrorBody } from '@/lib/api/client';
import {
  chunked,
  type CurateAction,
  type CurateItem,
  type CurateMode,
  type CurateResult,
  type VenueServicesGroup,
  type VenueServicesResponse,
} from '@/lib/collective-area/venue-services';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { collectiveServiceToolKeys } from '@/lib/queries/useCollectiveServiceTools';

/** The GET as it arrives: every field is read defensively, since an older server may leave some out. */
interface RawVenueServices {
  role?: string;
  collective_name?: string;
  host_venue_id?: string;
  host_name?: string | null;
  venues?: VenueServicesGroup[];
}

/** A connection that never reached the route: the request did not go, so it is not a refusal. */
function isOffline(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 0 || err.status === 408;
}

/**
 * GET every venue's own services: the host's view of the whole collective, or a member's own list.
 * `null` when the server does not have the route yet (404), so the caller hides what needs it.
 */
export function useVenueServices(collectiveId: string | null, enabled: boolean) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: collectiveServiceToolKeys.venueServices(accessToken, collectiveId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!collectiveId,
    retry: false,
    queryFn: async (): Promise<VenueServicesResponse | null> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      try {
        const data = await apiFetch<RawVenueServices>(`/api/venue/collectives/${collectiveId}/venue-services`, {
          accessToken,
        });
        return {
          role: data.role === 'host' ? 'host' : 'member',
          collective_name: data.collective_name ?? '',
          host_venue_id: data.host_venue_id ?? '',
          host_name: data.host_name ?? null,
          venues: (data.venues ?? []).map((g) => ({ ...g, services: g.services ?? [] })),
        };
      } catch (err) {
        // A server before 2026-10-27 (or a venue no longer in the collective): nothing to show.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

/** Everything a change to the page touches: the services, the grid, the suggestions, the bells. */
function useInvalidateCurated() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
    // Includes the suggestions and every venue's services (both keyed under collectives).
    void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.staffCollective.all() });
    void queryClient.invalidateQueries({ queryKey: ['collectiveHistory'] });
    // The public booking catalogue mirrors what is on the page.
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
  };
}

export interface CurateOutcome {
  /** One per service sent, in order. */
  results: CurateResult[];
  /** True when the route refused a whole request (not one service). */
  refused: boolean;
  /** The route's own words for that refusal, when it sent any. */
  refusal: string | null;
}

/**
 * POST services on or off the page, 200 at a time. A request the route refuses reports every
 * service in it as not done, with the route's words, so nothing is quietly dropped; a request that
 * never reached the route throws, so the caller can say to check the connection. The lists are
 * refreshed either way, since an earlier request may have gone through.
 */
export function useCurateServices(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateCurated();
  return useMutation({
    mutationFn: async (input: { action: CurateAction; items: CurateItem[]; mode?: CurateMode }): Promise<CurateOutcome> => {
      if (!accessToken || !collectiveId) throw new Error('Missing access token');
      const results: CurateResult[] = [];
      let refused = false;
      let refusal: string | null = null;
      for (const chunk of chunked(input.items)) {
        try {
          const data = await apiFetch<{ results?: CurateResult[] }>(
            `/api/venue/collectives/${collectiveId}/venue-services`,
            {
              accessToken,
              method: 'POST',
              body: JSON.stringify({ action: input.action, mode: input.mode ?? 'match', items: chunk }),
            },
          );
          results.push(...(data.results ?? []));
        } catch (err) {
          if (isOffline(err)) throw err;
          refused = true;
          const message = err instanceof ApiError && isApiErrorBody(err.body) ? err.message : undefined;
          if (refusal === null && message) refusal = message;
          for (const item of chunk) results.push({ ...item, ok: false, message });
        }
      }
      return { results, refused, refusal };
    },
    onSettled: invalidate,
  });
}

export interface SuggestOutcome {
  ok: boolean;
  /** How many were newly suggested. */
  suggested: number;
  /** True when every one was already waiting. */
  already_suggested: boolean;
  already_count: number;
  host_name: string | null;
}

/** POST a member's services as suggestions, in one go; the host gets one bell naming them all. */
export function useSuggestServices() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { collectiveId: string; serviceIds: string[] }): Promise<SuggestOutcome> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<Partial<SuggestOutcome>>(`/api/venue/collectives/${input.collectiveId}/suggestions`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ service_ids: input.serviceIds }),
      });
      return {
        ok: data.ok !== false,
        suggested: data.suggested ?? 0,
        already_suggested: data.already_suggested === true,
        already_count: data.already_count ?? 0,
        host_name: data.host_name ?? null,
      };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: collectiveServiceToolKeys.suggestions(accessToken, input.collectiveId) });
      void queryClient.invalidateQueries({
        queryKey: collectiveServiceToolKeys.venueServices(accessToken, input.collectiveId),
      });
    },
  });
}

/**
 * POST the host's "Not now" for some suggestions: they leave the list, and each venue is told
 * once by a bell naming its own. `declined` counts the ones that were still waiting.
 */
export function useDeclineSuggestions() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      serviceIds: string[];
    }): Promise<{ already: boolean; declined: number }> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ already?: boolean; declined?: number }>(
        `/api/venue/collectives/${input.collectiveId}/suggestions/decline`,
        { accessToken, method: 'POST', body: JSON.stringify({ service_ids: input.serviceIds }) },
      );
      return { already: data.already === true, declined: data.declined ?? 0 };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: collectiveServiceToolKeys.suggestions(accessToken, input.collectiveId) });
      void queryClient.invalidateQueries({
        queryKey: collectiveServiceToolKeys.venueServices(accessToken, input.collectiveId),
      });
    },
  });
}
