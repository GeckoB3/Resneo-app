/**
 * The collective tools on the Services screen (web `AppointmentServicesView`, W6/W7). Every route
 * takes the app's Bearer token: the collective routes resolve the venue through `resolveLinkAdmin`
 * (admins only), and the services PATCH through the same header-aware client.
 *
 *   Add from another venue   GET  /api/venue/collectives/[id]/offerings?source_venue_id=
 *                            POST /api/venue/collectives/[id]/offerings  { source_venue_id, source_service_id }
 *   Review your services     GET  /api/venue/collectives/review
 *                            POST /api/venue/collectives/review  { collective_id }
 *   A host service, as the   PATCH /api/venue/appointment-services  (calendars, the meeting link
 *   member reads it          and "Before the appointment" only)
 *
 * "Add from another venue" never sends a service's fields: the server copies the member's service
 * exactly as it is, so the body is two ids and nothing else.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch, isApiErrorBody } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** One of a member's own services the host can copy onto the page (web `OwnService`). */
export interface OwnService {
  id: string;
  name: string;
  duration_minutes: number | null;
  price_pence: number | null;
}

/** The checklist after leaving, being removed or the end of a collective (web `ReleaseReview`). */
export interface ReleaseReview {
  collective_id: string;
  collective_name: string;
  host_name: string;
  /** 'left' after leaving; anything else reads as removed or ended. */
  reason: string;
  released_at: string;
  prices: number;
  link: number;
  stripe: boolean;
  library: boolean;
  photos: 'copying' | 'done' | 'failed' | null;
  sameName: string[];
  unparked: number;
}

export const collectiveServiceToolKeys = {
  addFromServices: (accessToken: string | null, collectiveId: string | null, venueId: string | null) =>
    [...queryKeys.collectives.all(), 'addFromServices', keyScope(accessToken), collectiveId, venueId] as const,
  releaseReview: (accessToken: string | null) =>
    [...queryKeys.collectives.all(), 'releaseReview', keyScope(accessToken)] as const,
};

/**
 * The words a refusal shows: the route's own sentence when it sent one, the fallback when it did
 * not, and the connection sentence when the request never reached it (web `readError` + catch).
 */
export function refusalText(error: unknown, fallback: string, offline: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.status === 408) return offline;
    return isApiErrorBody(error.body) ? error.message : fallback;
  }
  return offline;
}

function useInvalidateServicesAndCollectives() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
    // The public booking catalogue mirrors service changes.
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
  };
}

/** GET a member's own services the host can add (web `AddFromVenueDialog`'s list). */
export function useAddFromVenueServices(collectiveId: string | null, venueId: string | null, enabled: boolean) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: collectiveServiceToolKeys.addFromServices(accessToken, collectiveId, venueId),
    enabled: enabled && isBackendConfigured() && accessToken !== null && !!collectiveId && !!venueId,
    retry: false,
    // A list the host picks from once: always the server's answer as it stands now.
    staleTime: 0,
    queryFn: async (): Promise<OwnService[]> => {
      if (!accessToken || !collectiveId || !venueId) throw new Error('Missing access token');
      const data = await apiFetch<{ services?: OwnService[] }>(
        `/api/venue/collectives/${collectiveId}/offerings?source_venue_id=${encodeURIComponent(venueId)}`,
        { accessToken },
      );
      return data.services ?? [];
    },
  });
}

/** POST the two ids; the server copies the service, puts it on the page and asks the member. */
export function useAddFromVenue() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateServicesAndCollectives();
  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      sourceVenueId: string;
      sourceServiceId: string;
    }): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(`/api/venue/collectives/${input.collectiveId}/offerings`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ source_venue_id: input.sourceVenueId, source_service_id: input.sourceServiceId }),
      });
    },
    onSuccess: invalidate,
  });
}

/** GET the signed-in venue's review, or null when there is none or it was dismissed. */
export function useReleaseReview(enabled: boolean) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: collectiveServiceToolKeys.releaseReview(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    retry: false,
    queryFn: async (): Promise<ReleaseReview | null> => {
      if (!accessToken) throw new Error('Missing access token');
      const data = await apiFetch<{ review?: ReleaseReview | null }>('/api/venue/collectives/review', { accessToken });
      return data.review ?? null;
    },
  });
}

/**
 * Dismiss the review. It goes at once (web: hidden first, then the POST, whose failure is ignored),
 * so the card never waits on the network.
 */
export function useDismissReleaseReview() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (collectiveId: string): Promise<unknown> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>('/api/venue/collectives/review', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ collective_id: collectiveId }),
      });
    },
    onMutate: async () => {
      const key = collectiveServiceToolKeys.releaseReview(accessToken);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, null);
    },
  });
}

/** The member's settings on a host service: the only fields the server lets it change. */
export interface MemberServiceSettingsBody {
  id: string;
  practitioner_ids: string[];
  /** The calendars that offered it when the view opened, so a change elsewhere is caught. */
  expected_calendar_ids: string[];
  online_meeting_url?: string;
  online_meeting_info?: string;
  pre_appointment_instructions?: string;
}

/** PATCH the member's settings; `acknowledge` keeps upcoming bookings on an unticked calendar. */
export function useSaveMemberServiceSettings() {
  const accessToken = useAccessToken();
  const invalidate = useInvalidateServicesAndCollectives();
  return useMutation({
    mutationFn: async ({ acknowledge, body }: { acknowledge: boolean; body: MemberServiceSettingsBody }) => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<unknown>(
        acknowledge
          ? '/api/venue/appointment-services?acknowledge_affected_bookings=true'
          : '/api/venue/appointment-services',
        { accessToken, method: 'PATCH', body: JSON.stringify(body) },
      );
    },
    onSuccess: invalidate,
  });
}
