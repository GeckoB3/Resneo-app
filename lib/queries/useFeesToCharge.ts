import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { isBackendConfigured } from '@/lib/env';
import { invalidateBookingCaches } from '@/lib/queries/useBookingMutations';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import type { FeeToCharge, FeesToChargeResponse } from '@/types/fees-to-charge';

/** The route the Today card reads. */
export const FEES_TO_CHARGE_PATH = '/api/venue/fees-to-charge';

/** Fills anything an answer leaves out, so one odd answer never breaks the card. */
function normalise(body: Partial<FeesToChargeResponse> | null | undefined): FeesToChargeResponse {
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    count: typeof body?.count === 'number' ? body.count : items.length,
    total_pence:
      typeof body?.total_pence === 'number' ? body.total_pence : items.reduce((sum, i) => sum + (i.amount_pence ?? 0), 0),
    currency: typeof body?.currency === 'string' && body.currency ? body.currency : (items[0]?.currency ?? 'GBP'),
  };
}

/**
 * GET /api/venue/fees-to-charge (Bearer): no-show and late-cancellation fees this business can still
 * charge, soonest deadline first (web Docs/fees-to-charge-plan.md §2.1, §2.2).
 *
 * The answer is null where the card must not show: 403 for anyone who cannot charge (only admins
 * can, FC4) and 404 from a web deploy older than the route. Any other failure leaves the query in
 * error, which the card also treats as hidden.
 */
export function useFeesToCharge(enabled = true) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: queryKeys.feesToCharge.list(accessToken),
    enabled: enabled && isBackendConfigured() && accessToken !== null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<FeesToChargeResponse | null> => {
      try {
        const body = await apiFetch<Partial<FeesToChargeResponse>>(FEES_TO_CHARGE_PATH, { accessToken: accessToken! });
        return normalise(body);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
        throw error;
      }
    },
  });
}

/** The words in a 409 "nothing to waive" answer (`{ error, message }`), else the error's own. */
export function waiveFeeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: unknown; error?: unknown } | undefined;
    if (body && typeof body.message === 'string' && body.message) return body.message;
    if (body && typeof body.error === 'string' && body.error) return body.error;
    return error.message;
  }
  return error instanceof Error ? error.message : 'The fee could not be waived. Please try again.';
}

/**
 * Waive a fee (FC5): POST /api/venue/visits/[visit_id]/charge-no-show `{ action: 'release' }`
 * releases the card hold of every service of this business in the visit the fee covers →
 * `{ released_booking_ids }`. 409 when there is nothing left to waive.
 */
export function useWaiveFee() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fee: Pick<FeeToCharge, 'visit_id' | 'booking_ids'>): Promise<{ released_booking_ids: string[] }> => {
      if (!accessToken) throw new Error('Missing access token');
      const body = await apiFetch<{ released_booking_ids?: string[] }>(
        `/api/venue/visits/${encodeURIComponent(fee.visit_id)}/charge-no-show`,
        { accessToken, method: 'POST', body: JSON.stringify({ action: 'release' }) },
      );
      return { released_booking_ids: Array.isArray(body?.released_booking_ids) ? body.released_booking_ids : [] };
    },
    // After a 409 too: someone else may have charged or waived it, so the list is read again.
    onSettled: (_data, _error, fee) =>
      invalidateBookingCaches(queryClient, accessToken, fee.booking_ids[0] ?? fee.visit_id),
  });
}

/**
 * "Send payment link" for a fee whose card can no longer be charged (FC2): POST
 * /api/venue/visits/[visit_id]/charge-no-show `{ action: 'payment_link', lines }` makes (or reuses)
 * a payment link for the fee's services and sends it to the client by email and text →
 * `{ payment_link: { url, sent }, message }`. `message` is the server's own words for staff.
 */
export function useSendFeeLink() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fee: Pick<FeeToCharge, 'visit_id' | 'booking_ids'>): Promise<{ message: string; url: string | null }> => {
      if (!accessToken) throw new Error('Missing access token');
      const body = await apiFetch<{ message?: string; payment_link?: { url?: string } }>(
        `/api/venue/visits/${encodeURIComponent(fee.visit_id)}/charge-no-show`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({ action: 'payment_link', lines: fee.booking_ids.map((id) => ({ booking_id: id })) }),
        },
      );
      return {
        message: typeof body?.message === 'string' && body.message ? body.message : 'Payment link sent to the client.',
        url: typeof body?.payment_link?.url === 'string' ? body.payment_link.url : null,
      };
    },
    onSettled: (_d, _e, fee) => invalidateBookingCaches(queryClient, accessToken, fee.booking_ids[0] ?? fee.visit_id),
  });
}
