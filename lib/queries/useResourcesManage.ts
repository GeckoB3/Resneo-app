import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { keyScope, queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { Practitioner, PractitionersResponse } from '@/types/practitioner';
import type {
  CreateResourceInput,
  Resource,
  ResourcesManageResponse,
  UpdateResourceInput,
} from '@/types/resources-manage';

/**
 * Local query keys for the resource setup/editing flow. Kept here (not in
 * lib/queries/keys.ts) — same `reserveNI` root as everything else so auth-scoped
 * cache clearing still covers these entries. Mutations also invalidate the
 * central bookings key so the day view + calendar refresh.
 */
export const resourceManageKeys = {
  all: () => [...queryKeys.all, 'resourcesManage'] as const,
  list: (accessToken?: string | null) =>
    [...resourceManageKeys.all(), 'list', keyScope(accessToken)] as const,
  hostCalendars: (accessToken?: string | null) =>
    [...resourceManageKeys.all(), 'hostCalendars', keyScope(accessToken)] as const,
};

function invalidateResources(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: resourceManageKeys.all() });
  // The day view + calendar read bookings/calendars from the central key.
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
}

/**
 * GET /api/venue/resources — full resource records (Bearer ✓). Returns the
 * complete shape (slot grid, pricing, payment, weekly hours, booking window).
 */
export function useResourcesManageList() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: resourceManageKeys.list(accessToken),
    enabled,
    queryFn: async (): Promise<Resource[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const data = await apiFetch<ResourcesManageResponse>('/api/venue/resources', {
        accessToken,
      });
      return [...(data.resources ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
      );
    },
  });
}

/** A non-resource calendar column a resource can be hosted on. */
export type HostCalendar = Pick<Practitioner, 'id' | 'name'> & {
  working_hours?: Practitioner['working_hours'];
};

/**
 * GET /api/venue/practitioners?roster=1 (Bearer ✓), filtered to the columns a
 * resource can be displayed on — every unified calendar that is NOT itself a
 * resource. The editor requires the user to pick one as the resource's host.
 */
export function useHostCalendars() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: resourceManageKeys.hostCalendars(accessToken),
    enabled,
    queryFn: async (): Promise<HostCalendar[]> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const data = await apiFetch<PractitionersResponse>('/api/venue/practitioners?roster=1', {
        accessToken,
      });
      return (data.practitioners ?? [])
        .filter((p) => p.calendar_type !== 'resource')
        .map((p) => ({ id: p.id, name: p.name, working_hours: p.working_hours }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** POST /api/venue/resources — create a resource. 403 unless `resource_booking` is enabled. */
export function useCreateResource() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateResourceInput): Promise<{ id?: string; availability_warning?: string }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ id?: string; availability_warning?: string }>('/api/venue/resources', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateResources(queryClient),
  });
}

/** PATCH /api/venue/resources — partial field update (`{ id, ...partial }`). */
export function useUpdateResource() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateResourceInput): Promise<{ id?: string; availability_warning?: string }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ id?: string; availability_warning?: string }>('/api/venue/resources', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateResources(queryClient),
  });
}

/**
 * DELETE /api/venue/resources — `{ id }`. The API returns 409 when upcoming
 * bookings block deletion (surface the server message via Toast).
 */
export function useDeleteResource() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/resources', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
    },
    onSuccess: () => invalidateResources(queryClient),
  });
}
