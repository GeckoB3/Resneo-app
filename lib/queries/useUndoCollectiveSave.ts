import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export interface UndoCollectiveSaveAnswer {
  /** The cleared values that came back, and the ones that could not (absent on older servers). */
  values_restored?: { calendar_id: string; service_id: string }[];
  values_not_restored?: { calendar_id: string; service_id: string }[];
}

/**
 * POST /api/venue/collectives/[id]/undo: Put it back for a save to a page service, inside its minute
 * (web `CollectiveSaveSummary`, CQ-11). `restore_values` is the save's `cleared_values`, so calendar
 * values it cleared come back too. After the minute the route answers 410.
 */
export function useUndoCollectiveSave() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      collectiveId: string;
      auditEventId: string;
      restoreValues?: { calendar_id: string; service_id: string; values: Record<string, number | null> }[];
    }): Promise<UndoCollectiveSaveAnswer> => {
      if (!accessToken) throw new Error('Missing access token');
      const answer = await apiFetch<UndoCollectiveSaveAnswer | null>(`/api/venue/collectives/${input.collectiveId}/undo`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({
          audit_event_id: input.auditEventId,
          ...(input.restoreValues && input.restoreValues.length > 0 ? { restore_values: input.restoreValues } : {}),
        }),
      });
      return answer ?? {};
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.services.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.collectives.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffCollective.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
      void queryClient.invalidateQueries({ queryKey: ['collectiveHistory'] });
    },
  });
}
