import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  FollowOnGroupInput,
  FollowOnGroupsResponse,
  FollowOnGroupUpsertResponse,
} from '@/types/follow-on-groups';

/**
 * The follow-on group routes (web `src/app/api/venue/follow-on-groups`, follow-on plan 7.2). Any
 * staff member may read; only admins write. A member's copy of its collective host's group answers
 * 409 `COLLECTIVE_MANAGED_FOLLOW_ON_GROUP` with words naming the host, which `ApiError.message`
 * carries to the screen.
 */

function invalidateFollowOnGroups(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.followOnGroups.all() });
  // Services list each service's follow-on groups, and the booking catalogue carries them.
  void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
}

/** GET /api/venue/follow-on-groups: every group at the venue, with who sets a member's copies. */
export function useFollowOnGroups(enabled = true) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.followOnGroups.list(accessToken),
    enabled: queryEnabled,
    queryFn: async (): Promise<FollowOnGroupsResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<FollowOnGroupsResponse>('/api/venue/follow-on-groups', { accessToken });
    },
  });
}

/** POST /api/venue/follow-on-groups: create a group with its services. Admin only. */
export function useCreateFollowOnGroup() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (group: FollowOnGroupInput): Promise<FollowOnGroupUpsertResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<FollowOnGroupUpsertResponse>('/api/venue/follow-on-groups', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ group }),
      });
    },
    onSuccess: () => invalidateFollowOnGroups(queryClient),
  });
}

/** PATCH /api/venue/follow-on-groups/[id]: replace a group's fields, offers and triggers. Admin only. */
export function useUpdateFollowOnGroup() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, group }: { id: string; group: FollowOnGroupInput }): Promise<FollowOnGroupUpsertResponse> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<FollowOnGroupUpsertResponse>(`/api/venue/follow-on-groups/${id}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ group }),
      });
    },
    onSuccess: () => invalidateFollowOnGroups(queryClient),
  });
}

/** DELETE /api/venue/follow-on-groups/[id]: the group and its links go. Bookings are untouched. */
export function useDeleteFollowOnGroup() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ success?: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ success?: boolean }>(`/api/venue/follow-on-groups/${id}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidateFollowOnGroups(queryClient),
  });
}
