import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type {
  BulkCreateClassInstancesInput,
  BulkCreateClassInstancesResult,
  CancelClassInstanceInput,
  CancelClassInstanceResult,
  ClassAttendeesResponse,
  CreateClassInstanceInput,
  CreateClassRuleInput,
  CreateClassTypeInput,
  DeleteClassEntityInput,
  GenerateInstancesInput,
  GenerateInstancesResult,
  ManagedClassesResponse,
  UpdateClassInstanceInput,
  UpdateClassRuleInput,
  UpdateClassTypeInput,
} from '@/types/classes-manage';

// ---------------------------------------------------------------------------
// Query keys — defined LOCALLY (keys.ts is shared and frozen for this feature).
// They nest under queryKeys.bookings.all() so the realtime-driven booking
// invalidations on the classes screen also refresh class data, and every write
// here additionally invalidates the central bookings + schedule prefixes (the
// timetable feed + rosters live under those).
// ---------------------------------------------------------------------------
export const classesManageKeys = {
  managed: (accessToken?: string | null) =>
    [...queryKeys.bookings.all(), 'classesManage', accessToken ?? null] as const,
  attendees: (accessToken?: string | null, classInstanceId?: string | null) =>
    [
      ...queryKeys.bookings.all(),
      'classAttendees',
      accessToken ?? null,
      classInstanceId ?? null,
    ] as const,
};

/**
 * Invalidate everything that reflects a class change: the local managed-classes
 * cache plus the central bookings/schedule prefixes (timetable feed + rosters
 * nest under those). Mirrors `invalidateServices` in useServicesManage.ts.
 */
function invalidateClasses(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
}

/** GET /api/venue/classes — class types, timetable, upcoming instances + picklists. */
export function useManagedClasses() {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: classesManageKeys.managed(accessToken),
    enabled,
    queryFn: async (): Promise<ManagedClassesResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<ManagedClassesResponse>('/api/venue/classes', { accessToken });
    },
  });
}

/** POST /api/venue/classes — create a class type (admin or scoped staff). */
export function useCreateClassType() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateClassTypeInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/classes', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/** PATCH /api/venue/classes — partial class-type update (`entity_type: 'class_type'`). */
export function useUpdateClassType() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateClassTypeInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/classes', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ ...input, entity_type: 'class_type' }),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * DELETE /api/venue/classes — delete a class type, timetable rule or instance
 * (by `entity_type`). The API returns 409 when upcoming bookings block it.
 */
export function useDeleteClassEntity() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DeleteClassEntityInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/classes', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/** POST /api/venue/class-instances — schedule a single one-off session. */
export function useCreateClassInstance() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateClassInstanceInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/class-instances', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * POST /api/venue/class-instances/bulk — schedule many one-off sessions at once
 * (admin/scoped staff). Caps at 100 rows server-side and skips any that
 * duplicate an existing (class_type_id, instance_date, start_time). Returns
 * `{ created, skipped }`; a window conflict surfaces as a 409 ApiError.
 */
export function useBulkCreateClassInstances() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: BulkCreateClassInstancesInput,
    ): Promise<BulkCreateClassInstancesResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<BulkCreateClassInstancesResult>('/api/venue/class-instances/bulk', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * POST /api/venue/class-instances/[id]/cancel — admin-only cancel-and-notify.
 * Distinct from delete: marks the session cancelled, cancels active bookings
 * with refunds per policy and notifies guests. Returns counts of bookings
 * cancelled + notifications scheduled.
 */
export function useCancelClassInstance() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: CancelClassInstanceInput,
    ): Promise<CancelClassInstanceResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CancelClassInstanceResult>(
        `/api/venue/class-instances/${input.classInstanceId}/cancel`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({
            confirm: true,
            ...(input.cancel_reason ? { cancel_reason: input.cancel_reason } : {}),
          }),
        },
      );
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/** PATCH /api/venue/classes — edit a session (`entity_type: 'instance'`). */
export function useUpdateClassInstance() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateClassInstanceInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/classes', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ ...input, entity_type: 'instance' }),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * POST /api/venue/classes — create a recurring weekly rule. The route routes on
 * the presence of `day_of_week` to `timetableEntrySchema`; the rule itself is
 * inert until sessions are generated (see {@link useGenerateInstances}).
 */
export function useCreateClassRule() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateClassRuleInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/classes', {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ recurrence_type: 'weekly', ...input }),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/** PATCH /api/venue/classes — update a recurring weekly rule (`entity_type: 'timetable'`). */
export function useUpdateClassRule() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateClassRuleInput): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>('/api/venue/classes', {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify({ ...input, entity_type: 'timetable' }),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * POST /api/venue/classes/generate-instances — materialise sessions from the
 * active weekly rules for the next N weeks (admin only; route clamps weeks to
 * 1–26). Skips dates already on the calendar and respects each rule's end
 * condition. Returns `{ created }`.
 */
export function useGenerateInstances() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GenerateInstancesInput): Promise<GenerateInstancesResult> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<GenerateInstancesResult>('/api/venue/classes/generate-instances', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * GET /api/venue/class-instances/[id]/attendees — roster with reliable
 * `checked_in_at` (the schedule/bookings-list roster omits it). Nested under
 * the bookings prefix so booking mutations refresh it too.
 */
export function useClassInstanceAttendees(classInstanceId: string | null) {
  const accessToken = useAccessToken();
  const enabled =
    isBackendConfigured() && accessToken !== null && classInstanceId !== null;

  return useQuery({
    queryKey: classesManageKeys.attendees(accessToken, classInstanceId),
    enabled,
    queryFn: async (): Promise<ClassAttendeesResponse> => {
      if (!accessToken || !classInstanceId) {
        throw new Error('Missing access token or class instance');
      }
      return apiFetch<ClassAttendeesResponse>(
        `/api/venue/class-instances/${classInstanceId}/attendees`,
        { accessToken },
      );
    },
  });
}

/**
 * POST .../attendees/[bookingId]/check-in — mark a guest checked in (idempotent).
 * ⚠ Gated by `requireClassCommercePlan`; may 403 when the flag is off — callers
 * should surface that gracefully rather than treat it as a hard failure.
 */
export function useCheckInAttendee() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      classInstanceId: string;
      bookingId: string;
    }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(
        `/api/venue/class-instances/${input.classInstanceId}/attendees/${input.bookingId}/check-in`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * POST .../attendees/[bookingId]/no-show — mark a guest as No Show (idempotent).
 * ⚠ Same commerce-plan gate as check-in (may 403).
 */
export function useNoShowAttendee() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      classInstanceId: string;
      bookingId: string;
    }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<unknown>(
        `/api/venue/class-instances/${input.classInstanceId}/attendees/${input.bookingId}/no-show`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}

/**
 * POST .../attendees/check-in-all — bulk check-in for every eligible attendee.
 * ⚠ Same commerce-plan gate (may 403). Returns `{ checked_in, total }`.
 */
export function useCheckInAll() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      classInstanceId: string,
    ): Promise<{ checked_in?: number; total?: number }> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<{ checked_in?: number; total?: number }>(
        `/api/venue/class-instances/${classInstanceId}/attendees/check-in-all`,
        { accessToken, method: 'POST' },
      );
    },
    onSuccess: () => invalidateClasses(queryClient),
  });
}
