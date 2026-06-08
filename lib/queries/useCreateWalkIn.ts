import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * POST /api/venue/bookings/walk-in - seated walk-in for restaurant / table-mode venues.
 * Mirrors the web walk-in modal payload (subset for mobile v1).
 */
export interface CreateWalkInPayload {
  party_size: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  dietary_notes?: string;
  occasion?: string;
  table_id?: string;
  table_ids?: string[];
  temporary_table_name?: string;
  booking_date?: string;
  booking_time?: string;
  area_id?: string;
  duration_minutes?: number;
}

export interface CreateWalkInResponse {
  booking_id?: string;
  id?: string;
  message?: string;
}

/** Creates a walk-in booking and invalidates dashboard + booking caches on success. */
export function useCreateWalkIn() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateWalkInPayload): Promise<CreateWalkInResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CreateWalkInResponse>('/api/venue/bookings/walk-in', {
        accessToken,
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
    },
  });
}
