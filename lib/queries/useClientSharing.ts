/**
 * Collective client sharing: query and mutation hooks, the twins of the web's calls
 * (web Docs/collective-client-sharing-plan.md §1A.3, §8). Every mutation re-reads the status the
 * server answers with, so web and app draw the same thing.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  ClientSharingCheckResponse,
  ClientSharingDecision,
  ClientSharingPreviewResponse,
  ClientSharingPutResponse,
  ClientSharingStatusResponse,
  SharedGuestResponse,
  VenueClientSharingSummary,
} from '@/types/client-sharing';

const base = (collectiveId: string) => `/api/venue/collectives/${collectiveId}/client-sharing`;

export function useClientSharingSummary(options: { enabled?: boolean } = {}) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.clientSharing.summary(accessToken),
    enabled: isBackendConfigured() && accessToken !== null && options.enabled !== false,
    staleTime: 30_000,
    queryFn: () => apiFetch<VenueClientSharingSummary>('/api/venue/client-sharing', { accessToken }),
  });
}

export function useClientSharingStatus(collectiveId: string | null, options: { pollWhileRunning?: boolean } = {}) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.clientSharing.status(accessToken, collectiveId),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(collectiveId),
    staleTime: 0,
    queryFn: () => apiFetch<ClientSharingStatusResponse>(base(collectiveId!), { accessToken }),
    // While lists are being brought together the progress line moves on its own (§1A.2 step 4).
    refetchInterval: (query) =>
      options.pollWhileRunning !== false && (query.state.data?.progress || (query.state.data?.arriving ?? 0) > 0)
        ? 4_000
        : false,
  });
}

export function useClientSharingCheck(collectiveId: string | null) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.clientSharing.check(accessToken, collectiveId),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(collectiveId),
    staleTime: 0,
    queryFn: () => apiFetch<ClientSharingCheckResponse>(`${base(collectiveId!)}/check?limit=50`, { accessToken }),
  });
}

export function useSharedGuest(guestId: string | null) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.clientSharing.guest(accessToken, guestId),
    enabled: isBackendConfigured() && accessToken !== null && Boolean(guestId),
    staleTime: 30_000,
    queryFn: () => apiFetch<SharedGuestResponse>(`/api/venue/guests/${guestId}/shared`, { accessToken }),
  });
}

function useInvalidateSharing() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.clientSharing.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.guests.all() });
  };
}

export interface ClientSharingChoices {
  offered?: boolean;
  share?: boolean;
  ask_first?: boolean;
  excluded_venue_ids?: string[];
}

export function useSetClientSharing(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choices: ClientSharingChoices) =>
      apiFetch<ClientSharingPutResponse>(base(collectiveId!), {
        accessToken,
        method: 'PUT',
        body: JSON.stringify(choices),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.clientSharing.status(accessToken, collectiveId), data);
    },
    onSettled: invalidate,
  });
}

export function useClientSharingPreview(collectiveId: string | null) {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: () =>
      apiFetch<ClientSharingPreviewResponse>(`${base(collectiveId!)}/preview`, { accessToken, method: 'POST' }),
  });
}

export function useStartClientSharing(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: () =>
      apiFetch<ClientSharingStatusResponse>(`${base(collectiveId!)}/start`, { accessToken, method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useStopClientSharing(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: (excludeVenueId?: string) =>
      apiFetch<ClientSharingStatusResponse & { kept: number }>(`${base(collectiveId!)}/stop`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify(excludeVenueId ? { exclude_venue_id: excludeVenueId } : {}),
      }),
    onSettled: invalidate,
  });
}

export function useAskEveryoneToShare(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; asked: number }>(`${base(collectiveId!)}/ask`, { accessToken, method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useDismissClientSharing(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: (what: 'request' | 'nudge') =>
      apiFetch<{ ok: true }>(`${base(collectiveId!)}/dismiss`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ what }),
      }),
    onSettled: invalidate,
  });
}

export function useDecideClientCard(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: ({ cardId, decision }: { cardId: string; decision: ClientSharingDecision }) =>
      apiFetch<{ ok: true }>(`${base(collectiveId!)}/check/${cardId}`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ decision }),
      }),
    onSettled: invalidate,
  });
}

export function useJoinAllLikely(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; batch_id: string; joined: number }>(`${base(collectiveId!)}/check`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'join_all_likely' }),
      }),
    onSettled: invalidate,
  });
}

export function useUndoJoinAll(collectiveId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: (batchId: string) =>
      apiFetch<{ ok: true; undone: number }>(`${base(collectiveId!)}/check`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'undo', batch_id: batchId }),
      }),
    onSettled: invalidate,
  });
}

export function useSeparateSharedGuest(guestId: string | null) {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateSharing();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/venue/guests/${guestId}/shared`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'separate' }),
      }),
    onSettled: invalidate,
  });
}
