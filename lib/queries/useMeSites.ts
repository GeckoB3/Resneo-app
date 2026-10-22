import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { noteActiveVenueId } from '@/lib/sites/active-site';
import type { MeSite, MeSites, SitesOverview } from '@/types/sites';

/**
 * The login's sites, pending invites and whether the All sites overview applies
 * (`GET /api/v1/me/sites`, web roles plan §6.2c, Appendix A). Feeds the site picker in the More
 * tab's header and the offer after sign-in. A server without the route answers 404, and the picker
 * simply does not appear: one site, as before.
 */
export function useMeSites(options: { enabled?: boolean } = {}) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && (options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.sites.me(accessToken),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<MeSites> => {
      if (!accessToken) throw new Error('Missing access token');
      const body = await apiFetch<MeSites>('/api/v1/me/sites', { accessToken });
      // Which site the server says this login acts on, so a push for it needs no switch.
      noteActiveVenueId(body.active_venue_id ?? null);
      return body;
    },
  });
}

/** `POST /api/v1/me/invites/[staffId]/accept`: Join a business that invited this login. */
export function useAcceptSiteInvite() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (staffId: string): Promise<{ site: MeSite | null }> =>
      apiFetch<{ site: MeSite | null }>(`/api/v1/me/invites/${encodeURIComponent(staffId)}/accept`, {
        accessToken,
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sites.all() });
    },
  });
}

/** `POST /api/v1/me/invites/[staffId]/decline`: the business would need to invite them again. */
export function useDeclineSiteInvite() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (staffId: string): Promise<{ declined: true }> =>
      apiFetch<{ declined: true }>(`/api/v1/me/invites/${encodeURIComponent(staffId)}/decline`, {
        accessToken,
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sites.me() });
    },
  });
}

/**
 * The All sites overview (`GET /api/venue/sites/overview`, web roles plan §6.7, Appendix A): each
 * site the person owns or runs as an admin, with its own figures, grouped by owner. The server
 * ignores the site header and isolates each site, so one that fails comes back as its own `error`
 * entry while the rest show. Never cached for long: `staleTime` 0, refreshed by pulling down.
 */
export function useSitesOverview(options: { enabled?: boolean } = {}) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null && (options.enabled ?? true);
  return useQuery({
    queryKey: queryKeys.sites.overview(accessToken),
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<SitesOverview> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<SitesOverview>('/api/venue/sites/overview', { accessToken, timeoutMs: 30_000 });
    },
  });
}
