import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { AmendedHoursEntry, PutAmendedHoursInput } from '@/lib/availability/calendar-amended-hours';
import { isBackendConfigured } from '@/lib/env';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * `/api/venue/calendar-amended-hours` (web #187): amended hours for one
 * calendar, written to `unified_calendars.availability_exceptions`. A save
 * changes what the practitioners feed carries, so every write invalidates the
 * calendars as well as the availability screen's own queries.
 */

function invalidateAfterWrite(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.availabilityManage.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.practitioners.all() });
}

/** GET ?from&to[&practitioner_id] → the runs in the window, per calendar. */
export function useAmendedHours(from: string, to: string, practitionerId?: string | null) {
  const accessToken = useAccessToken();
  const enabled = isBackendConfigured() && accessToken !== null;

  return useQuery({
    queryKey: queryKeys.availabilityManage.amendedHours(accessToken, from, to, practitionerId ?? null),
    enabled,
    queryFn: async (): Promise<AmendedHoursEntry[]> => {
      if (!accessToken) throw new Error('Missing access token');
      const params = new URLSearchParams({ from, to });
      if (practitionerId) params.set('practitioner_id', practitionerId);
      const res = await apiFetch<{ entries?: AmendedHoursEntry[] }>(
        `/api/venue/calendar-amended-hours?${params.toString()}`,
        { accessToken },
      );
      return res.entries ?? [];
    },
  });
}

/**
 * PUT: set the hours for every date in the range. Answers 409
 * `requires_confirmation` when the change strands an upcoming booking; the
 * caller asks, then sends again with `acknowledge: true`. A plain 409 `error`
 * is a full-day leave in the range, which the route refuses outright.
 */
export function usePutAmendedHours() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: PutAmendedHoursInput & { acknowledge?: boolean },
    ): Promise<{ updated: number; calendar_ids: string[] }> => {
      if (!accessToken) throw new Error('Missing access token');
      const { acknowledge, ...body } = input;
      const url = acknowledge
        ? '/api/venue/calendar-amended-hours?acknowledge_affected_bookings=true'
        : '/api/venue/calendar-amended-hours';
      return apiFetch<{ updated: number; calendar_ids: string[] }>(url, {
        accessToken,
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => invalidateAfterWrite(queryClient),
  });
}

/** DELETE: remove every override in the range on one calendar. */
export function useDeleteAmendedHours() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      practitioner_id: string;
      date_start: string;
      date_end: string;
    }): Promise<{ ok: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ ok: boolean }>('/api/venue/calendar-amended-hours', {
        accessToken,
        method: 'DELETE',
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => invalidateAfterWrite(queryClient),
  });
}
