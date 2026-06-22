import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { experienceEventKeys } from '@/lib/queries/useExperienceEvents';
import type {
  CreateEventInput,
  CreateEventResponse,
  ManagedEvent,
  ManagedEventsResponse,
  UpdateEventInput,
} from '@/types/events-manage';

/**
 * Local query keys for the event setup/editing flow. Kept here (not in
 * lib/queries/keys.ts) — same `reserveNI` root so auth-scoped cache clearing
 * still covers these entries.
 */
export const eventManageKeys = {
  all: () => [...queryKeys.all, 'eventsManage'] as const,
  list: (accessToken?: string | null) =>
    [...eventManageKeys.all(), 'list', keyScope(accessToken)] as const,
};

function invalidateEvents(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: eventManageKeys.all() });
  // The read-only Events screen + its roster derive from the schedule feed.
  void queryClient.invalidateQueries({ queryKey: experienceEventKeys.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
}

/**
 * GET /api/venue/experience-events — full event records with their ticket types
 * and settings (Bearer ✓). The source of truth for the editor (the read-only
 * Events screen still uses the lighter schedule-feed summary for its roster).
 */
export function useManagedEvents() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: eventManageKeys.list(accessToken),
    enabled,
    queryFn: async (): Promise<ManagedEvent[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const data = await apiFetch<ManagedEventsResponse>('/api/venue/experience-events', {
        accessToken,
      });
      return [...(data.events ?? [])].sort((a, b) => {
        const dc = a.event_date.localeCompare(b.event_date);
        return dc !== 0 ? dc : a.start_time.localeCompare(b.start_time);
      });
    },
  });
}

/** POST /api/venue/experience-events — create an event (admin or managed-calendar staff). */
export function useCreateEvent() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEventInput): Promise<CreateEventResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CreateEventResponse>('/api/venue/experience-events', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateEvents(queryClient),
  });
}

/**
 * PATCH /api/venue/experience-events — update by `{ id, ...partial }`.
 * `ticket_types` is REPLACE-ALL; omit it to leave tickets untouched.
 */
export function useUpdateEvent() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEventInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/experience-events', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateEvents(queryClient),
  });
}

/**
 * DELETE /api/venue/experience-events — `{ id }`. Returns 409 when the event has
 * active bookings (surface the server message via Toast).
 */
export function useDeleteEvent() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/experience-events', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => invalidateEvents(queryClient),
  });
}

/**
 * POST /api/venue/experience-events/[id]/cancel { confirm: true } — admin only.
 * Cancels the event and all active bookings with refunds + guest comms.
 */
export function useCancelEvent() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/experience-events/${id}/cancel`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
    },
    onSuccess: () => invalidateEvents(queryClient),
  });
}
