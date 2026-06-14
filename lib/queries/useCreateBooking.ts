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
  /** Staff override for this booking's duration (minutes). */
  duration_minutes?: number;
  /** Dietary notes from the guest (max 500 chars). */
  dietary_notes?: string;
  /** Occasion (max 200 chars). */
  occasion?: string;
  /** Special requests (max 500 chars). */
  special_requests?: string;
  /** Force Stripe deposit link generation even for phone bookings. */
  require_deposit?: boolean;
  /**
   * Flag the booking as belonging to an existing/known contact. The web sends
   * this when staff pick a known contact (or rebook a guest) so the backend
   * links the booking to the existing client rather than minting a new one.
   */
  returning_guest?: boolean;
  /** Admin override for compliance pre-check failures (409 COMPLIANCE_REQUIREMENT_UNMET). */
  override_compliance?: boolean;
}

export interface CreateBookingResponse {
  booking_id: string;
  payment_url?: string;
  message?: string;
  requires_deposit?: boolean;
  deposit_amount_pence?: number;
  cancellation_notice_hours?: number;
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
      // A new booking must also refresh the calendar grid (day/week/month);
      // it keys off calendar.* and otherwise shows stale until the 60s poll.
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}
