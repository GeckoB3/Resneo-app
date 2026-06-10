import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';

/**
 * POST /api/booking/appointment-waitlist — add a guest to the appointment
 * waitlist when no slots fit (public route; venue-scoped by venue_id).
 */
export function useJoinWaitlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      venue_id: string;
      service_id: string;
      desired_date: string;
      practitioner_id?: string;
      first_name: string;
      last_name: string;
      guest_email: string;
      guest_phone: string;
    }): Promise<unknown> => {
      return apiFetch<unknown>('/api/booking/appointment-waitlist', {
        method: 'POST',
        body: JSON.stringify({ ...input, preferred_window: 'all_day' }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.waitlist.all() });
    },
  });
}
