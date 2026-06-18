import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import type { CreateMultiServicePayload } from '@/lib/booking/multi-service-chain';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * Response from POST /api/booking/create-multi-service (and create-group — same
 * shape). One group_booking_id ties the N created rows together; `client_secret`
 * + `stripe_account_id` are present only when an online deposit/full payment is
 * required (the in-app Stripe PaymentSheet extension point — see ConfirmStep).
 */
export interface GroupedBookingResponse {
  group_booking_id: string;
  booking_ids: string[];
  /** Multi-service returns this explicitly; group falls back to booking_ids[0]. */
  primary_booking_id?: string;
  requires_deposit: boolean;
  total_deposit_pence: number;
  /** Stripe PaymentIntent client secret — set only when requires_deposit. */
  client_secret?: string;
  /** Connected Stripe account id — set only when requires_deposit. */
  stripe_account_id?: string;
  status: 'Pending' | 'Booked';
  cancellation_notice_hours?: number;
}

/**
 * Creates a multi-service (back-to-back) appointment visit for ONE client.
 *
 * Mirrors the web staff `AppointmentBookingFlow`, which posts the public
 * `/api/booking/create-multi-service` route with `source: 'phone' | 'walk-in'`.
 * The route does all DB work with the admin client, so the route does not
 * require staff auth; the Bearer token is sent harmlessly for parity.
 *
 * The whole visit is one server call: the backend validates the consecutive
 * chain, creates N linked `bookings` rows under one group_booking_id, and (if a
 * deposit is owed) opens ONE Stripe PaymentIntent for the summed deposit. There
 * is therefore no app-side rollback to write — partial failure is the server's
 * responsibility (it deletes already-inserted rows on error).
 */
export function useCreateMultiServiceBooking() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: CreateMultiServicePayload,
    ): Promise<GroupedBookingResponse> => {
      return apiFetch<GroupedBookingResponse>('/api/booking/create-multi-service', {
        // Public route; token forwarded only when present (web sends none).
        ...(accessToken ? { accessToken } : {}),
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
    },
  });
}
