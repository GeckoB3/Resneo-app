import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  LeaveType,
  PatchPractitionerInput,
  PractitionerBlocksResponse,
  PractitionerLeaveResponse,
  UpdateBlockInput,
  UpdateLeaveInput,
} from '@/types/availability-manage';

function invalidateAvailability(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.availabilityManage.all() });
  // Blocks/leave change which calendar slots are free.
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
}

function invalidatePractitioners(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.practitioners.all() });
  // Working hours changes also affect slot availability.
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
}

/** GET /api/venue/practitioner-calendar-blocks?from=&to= (Bearer). */
export function useCalendarBlocks(
  from: string,
  to: string,
  practitionerId?: string | null,
) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [
      ...queryKeys.availabilityManage.blocks(accessToken, from, to),
      practitionerId ?? null,
    ],
    enabled,
    queryFn: async (): Promise<PractitionerBlocksResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to });
      if (practitionerId) params.set('practitioner_id', practitionerId);
      return apiFetch<PractitionerBlocksResponse>(
        `/api/venue/practitioner-calendar-blocks?${params}`,
        { accessToken },
      );
    },
  });
}

/** POST /api/venue/practitioner-calendar-blocks — block out time for a practitioner. */
export function useCreateBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      practitioner_id: string;
      block_date: string;
      start_time: string;
      end_time: string;
      reason?: string;
    }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/practitioner-calendar-blocks', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}

/** PATCH /api/venue/practitioner-calendar-blocks/[id] — edit an existing block. */
export function useUpdateBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blockId, ...patch }: UpdateBlockInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(`/api/venue/practitioner-calendar-blocks/${blockId}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}

/** DELETE /api/venue/practitioner-calendar-blocks/[id]. */
export function useDeleteBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockId: string): Promise<{ ok: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ ok: boolean }>(`/api/venue/practitioner-calendar-blocks/${blockId}`, {
        accessToken,
        method: 'DELETE',
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}

/** GET /api/venue/practitioner-leave?from=&to= (Bearer). */
export function usePractitionerLeave(
  from: string,
  to: string,
  practitionerId?: string | null,
) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: [
      ...queryKeys.availabilityManage.leave(accessToken, from, to),
      practitionerId ?? null,
    ],
    enabled,
    queryFn: async (): Promise<PractitionerLeaveResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const params = new URLSearchParams({ from, to });
      if (practitionerId) params.set('practitioner_id', practitionerId);
      return apiFetch<PractitionerLeaveResponse>(
        `/api/venue/practitioner-leave?${params}`,
        { accessToken },
      );
    },
  });
}

/** POST /api/venue/practitioner-leave — create a leave period (full-day or partial). */
export function useCreateLeave() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      practitioner_id?: string;
      apply_to_all_active?: boolean;
      start_date: string;
      end_date: string;
      leave_type: LeaveType;
      notes?: string;
      unavailable_start_time?: string | null;
      unavailable_end_time?: string | null;
    }): Promise<{ created: number }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ created: number }>('/api/venue/practitioner-leave', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}

/** PATCH /api/venue/practitioner-leave — edit an existing leave period. */
export function useUpdateLeave() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateLeaveInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/practitioner-leave', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}

/** DELETE /api/venue/practitioner-leave — body { id }. */
export function useDeleteLeave() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leaveId: string): Promise<{ success: boolean }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ success: boolean }>('/api/venue/practitioner-leave', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify({ id: leaveId }),
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}

/** PATCH /api/venue/practitioners — update working hours and/or breaks. */
export function usePatchPractitioner() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: PatchPractitionerInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/practitioners', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ id, ...patch }),
      });
    },
    onSuccess: () => invalidatePractitioners(queryClient),
  });
}
