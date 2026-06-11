import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  AddonGroupsResponse,
  AddonGroupUpsertResponse,
  CreateAddonGroupPayload,
  AddonGroupInput,
} from '@/types/addon-groups';

function invalidateAddonGroups(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.addonGroups.all() });
  // Services embed addon group data — must refetch too.
  void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
}

/** GET /api/venue/addon-groups — the venue's add-on catalogue (Bearer). */
export function useAddonGroups(enabled = true, includeInactive = false) {
  const accessToken = useAccessToken();
  const queryEnabled = enabled && isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [...queryKeys.addonGroups.list(accessToken), includeInactive] as const,
    enabled: queryEnabled,
    queryFn: async (): Promise<AddonGroupsResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const qs = includeInactive ? '?include_inactive=true' : '';
      return apiFetch<AddonGroupsResponse>(`/api/venue/addon-groups${qs}`, { accessToken });
    },
  });
}

/** POST /api/venue/addon-groups — admin only. Creates a new group with its add-ons. */
export function useCreateAddonGroup() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateAddonGroupPayload): Promise<AddonGroupUpsertResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<AddonGroupUpsertResponse>('/api/venue/addon-groups', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => invalidateAddonGroups(queryClient),
  });
}

/** PATCH /api/venue/addon-groups/[id] — admin only. Updates an existing group. */
export function useUpdateAddonGroup() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, group }: { id: string; group: AddonGroupInput }): Promise<AddonGroupUpsertResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<AddonGroupUpsertResponse>(`/api/venue/addon-groups/${id}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ group }),
      });
    },
    onSuccess: () => invalidateAddonGroups(queryClient),
  });
}

/**
 * DELETE /api/venue/addon-groups/[id] — admin only.
 * Auto-archives (is_active=false) when booking history exists;
 * responds with {archived:true}. Hard-delete responds with {success:true}.
 * Both are treated as success on the mobile side.
 */
export function useDeleteAddonGroup() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<{ success?: boolean; archived?: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success?: boolean; archived?: boolean }>(`/api/venue/addon-groups/${id}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidateAddonGroups(queryClient),
  });
}
