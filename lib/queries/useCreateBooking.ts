import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/** POST /api/venue/bookings — staff walk-in / phone create body (appointment subset). */
export interface CreateBookingPayload {
  booking_date: string;
  booking_time: string;
  party_size: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  practitioner_id?: string;
  appointment_service_id?: string;
  service_variant_id?: string;
  addons?: { addon_id: string }[];
  source?: 'phone' | 'walk-in';
  owner_venue_id?: string;
}

export interface CreateBookingResponse {
  booking_id: string;
  payment_url?: string;
  message?: string;
}

/**
 * Creates a staff booking via POST /api/venue/bookings.
 * Invalidates dashboard and bookings caches on success.
 */
export function useCreateBooking() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateBookingPayload): Promise<CreateBookingResponse> => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }
      return apiFetch<CreateBookingResponse>('/api/venue/bookings', {
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
