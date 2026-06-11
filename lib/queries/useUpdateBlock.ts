import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

function invalidateAvailability(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.availabilityManage.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all() });
}

/** PATCH /api/venue/practitioner-calendar-blocks/[id] — update a time block. */
export function useUpdateBlock() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      start_time?: string;
      end_time?: string;
      reason?: string | null;
    }): Promise<unknown> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      const { id, ...body } = input;
      return apiFetch<unknown>(`/api/venue/practitioner-calendar-blocks/${id}`, {
        accessToken,
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => invalidateAvailability(queryClient),
  });
}
