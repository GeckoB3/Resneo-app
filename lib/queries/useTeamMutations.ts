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

/**
 * A team member as a role or switch change will leave them (web `team-policy.ts`), for the list
 * while the PATCH is on its way; the refetch afterwards has the server's word. `role_key` wins over
 * `role`; a stored role change without one clears Front desk; someone made an admin starts without
 * "Billing, payouts and admins" and, unless the request says, without "Can export client data", and
 * loses the contact and diary switches (they are for Front desk and Staff only). Each switch in
 * `permissions` sets its key; null puts it back to absent.
 */
export function optimisticTeamMember(member: TeamMember, body: PatchStaffBody): TeamMember {
  const next: TeamMember = { ...member, permissions: { ...(member.permissions ?? {}) } };
  const permissions = next.permissions!;
  if (body.name !== undefined) next.name = body.name;
  const wasAdmin = member.role === 'admin';
  const toRole = body.role_key ? (body.role_key === 'admin' ? 'admin' : 'staff') : body.role;
  if (toRole) {
    next.role = toRole;
    if (toRole === 'admin') {
      delete permissions.role_key;
      delete permissions.client_contact;
      delete permissions.other_diaries;
      if (!wasAdmin) {
        permissions.billing_payouts_admins = false;
        if (body.permissions?.export_clients === undefined) permissions.export_clients = false;
      }
      if (!member.is_owner) next.role_key = 'admin';
    } else {
      delete permissions.billing_payouts_admins;
      if (body.role_key === 'front_desk') permissions.role_key = 'front_desk';
      else if (body.role_key === 'staff' || wasAdmin) delete permissions.role_key;
      next.role_key = permissions.role_key === 'front_desk' ? 'front_desk' : 'staff';
    }
  }
  const switches = body.permissions ?? {};
  for (const key of ['billing_payouts_admins', 'client_contact', 'export_clients', 'other_diaries'] as const) {
    if (!(key in switches)) continue;
    const value = switches[key];
    if (value === null) delete permissions[key];
    else if (value !== undefined) (permissions as Record<string, unknown>)[key] = value;
  }
  return next;
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
      // Optimistic update of the role and switches in the list cache.
      await queryClient.cancelQueries({ queryKey: queryKeys.team.all() });
      const prev = queryClient.getQueryData<TeamListResponse>(
        queryKeys.team.list(accessToken),
      );
      if (prev && (body.role || body.role_key || body.permissions)) {
        queryClient.setQueryData<TeamListResponse>(queryKeys.team.list(accessToken), {
          staff: prev.staff.map((m) => (m.id === id ? optimisticTeamMember(m, body) : m)),
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
/**
 * Change the signed-in user's own password.
 *
 * POST /api/account/password, NOT /api/venue/staff/change-password. The staff
 * route updates the password through the server's cookie-backed Supabase
 * client (`supabase.auth.updateUser`), which reads its session from cookie
 * storage; a Bearer request from the app has no cookie session, so GoTrue
 * answered "Auth session missing" and the password never changed (reported
 * 2026-09-10 from the Team page). The account route updates the user AS THE
 * CALLER from the Bearer (web `updateAuthUserAsCaller`, P0-12) and sets
 * `has_set_password` the same way, so the app's set-password screen and the
 * My account sheet both go through it. Callers keep the `{ new_password }`
 * body; the wire name is `password`.
 */
export function useChangeOwnPassword() {
  const accessToken = useAccessToken();

  return useMutation({
    mutationFn: async (body: ChangePasswordBody): Promise<{ success: boolean }> => {
      if (!accessToken) throw new ApiError('Not signed in', 401);
      const res = await apiFetch<{ ok?: boolean; success?: boolean }>('/api/account/password', {
        method: 'POST',
        body: JSON.stringify({ password: body.new_password }),
        accessToken,
      });
      return { success: res.ok === true || res.success === true };
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
