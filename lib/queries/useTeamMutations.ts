import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  ChangePasswordBody,
  InviteStaffBody,
  InviteStaffResponse,
  PatchStaffBody,
  PatchStaffCalendarBody,
  PatchStaffCalendarResponse,
  PatchStaffMeBody,
  PatchStaffResponse,
  PutSessionSettingsBody,
  ResetPasswordBody,
  TeamListResponse,
  TeamMember,
} from '@/types/staff';

/** POST /api/venue/staff/invite — admin invites a new staff member. */
export function useInviteStaff() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: InviteStaffBody): Promise<InviteStaffResponse> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<InviteStaffResponse>('/api/venue/staff/invite', {
        method: 'POST',
        body: JSON.stringify(body),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.all() });
    },
  });
}

/** PATCH /api/venue/staff/[id] — admin updates role or name. */
export function usePatchStaffMember() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: PatchStaffBody;
    }): Promise<PatchStaffResponse> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<PatchStaffResponse>(`/api/venue/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        accessToken,
      });
    },
    onMutate: async ({ id, body }) => {
      // Optimistic update of the role in the list cache.
      await queryClient.cancelQueries({ queryKey: queryKeys.team.all() });
      const prev = queryClient.getQueryData<TeamListResponse>(
        queryKeys.team.list(accessToken),
      );
      if (prev && body.role) {
        queryClient.setQueryData<TeamListResponse>(queryKeys.team.list(accessToken), {
          staff: prev.staff.map((m) =>
            m.id === id ? { ...m, role: body.role as TeamMember['role'] } : m,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.team.list(accessToken), ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.all() });
    },
  });
}

/** DELETE /api/venue/staff/[id] — admin removes a staff member. */
export function useDeleteStaffMember() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      await apiFetch<{ success: boolean }>(`/api/venue/staff/${id}`, {
        method: 'DELETE',
        accessToken,
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.team.all() });
      const prev = queryClient.getQueryData<TeamListResponse>(
        queryKeys.team.list(accessToken),
      );
      if (prev) {
        queryClient.setQueryData<TeamListResponse>(queryKeys.team.list(accessToken), {
          staff: prev.staff.filter((m) => m.id !== id),
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.team.list(accessToken), ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.all() });
    },
  });
}

/** POST /api/venue/staff/[id]/resend-invite — admin resends a sign-in link. */
export function useResendInvite() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (id: string): Promise<{ ok: boolean; message?: string }> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<{ ok: boolean; message?: string }>(
        `/api/venue/staff/${id}/resend-invite`,
        {
          method: 'POST',
          accessToken,
        },
      );
    },
  });
}

/** POST /api/venue/staff/[id]/reset-password — admin resets another user's password. */
export function useResetStaffPassword() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: ResetPasswordBody;
    }): Promise<{ success: boolean }> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<{ success: boolean }>(
        `/api/venue/staff/${id}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          accessToken,
        },
      );
    },
  });
}

/** PATCH /api/venue/staff/[id]/calendar — admin assigns calendars to a staff member. */
export function usePatchStaffCalendar() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: PatchStaffCalendarBody;
    }): Promise<PatchStaffCalendarResponse> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<PatchStaffCalendarResponse>(
        `/api/venue/staff/${id}/calendar`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
          accessToken,
        },
      );
    },
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.team.all() });
      const prev = queryClient.getQueryData<TeamListResponse>(
        queryKeys.team.list(accessToken),
      );
      if (prev) {
        queryClient.setQueryData<TeamListResponse>(queryKeys.team.list(accessToken), {
          staff: prev.staff.map((m) =>
            m.id === id
              ? { ...m, linked_calendar_ids: body.calendar_ids }
              : m,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.team.list(accessToken), ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team.all() });
    },
  });
}

/** POST /api/venue/staff/change-password — any staff changes own password. */
export function useChangeOwnPassword() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (body: ChangePasswordBody): Promise<{ success: boolean }> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<{ success: boolean }>('/api/venue/staff/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
        accessToken,
      });
    },
  });
}

/** PATCH /api/venue/staff/me — any staff updates own profile. */
export function usePatchStaffMe() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: PatchStaffMeBody) => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<{ staff: { id: string; email: string; name: string | null; phone: string | null; role: string } }>(
        '/api/venue/staff/me',
        {
          method: 'PATCH',
          body: JSON.stringify(body),
          accessToken,
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all() });
    },
  });
}

/** GET/PUT /api/venue/staff/session-settings — admin reads and updates session timeout. */
export function useUpdateSessionSettings() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: PutSessionSettingsBody): Promise<{ success: boolean }> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      return apiFetch<{ success: boolean }>('/api/venue/staff/session-settings', {
        method: 'PUT',
        body: JSON.stringify(body),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.team.sessionSettings(accessToken),
      });
    },
  });
}
