import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { BookingLogEmailConfig } from '@/types/reports';

interface SaveBookingLogEmailPayload {
  enabled: boolean;
  recipient_email: string | null;
  schedule: { day: number; time: string }[];
}

/**
 * PATCH /api/venue/reports/booking-log-email — saves the daily booking digest settings.
 * Invalidates the reports query on success so the screen reflects the saved config.
 */
export function useBookingLogEmailMutation() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SaveBookingLogEmailPayload): Promise<BookingLogEmailConfig> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<BookingLogEmailConfig>('/api/venue/reports/booking-log-email', {
        method: 'PATCH',
        body: JSON.stringify(payload),
        accessToken,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.all() });
    },
  });
}
