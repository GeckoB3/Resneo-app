import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { getTerminalSdk, terminalErrorMessage } from '@/lib/payments/terminal-sdk';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

/**
 * In-person payment mutations (Tap to Pay design doc §7.7).
 *
 * All three hit `POST /api/venue/bookings/[id]/charge`. Modelled on
 * `useBookingDeposit` in `lib/queries/useBookingMutations.ts`.
 *
 * SOURCE OF TRUTH: the Stripe webhook writes the authoritative paid state. The
 * card flow here never marks a booking paid from the client confirm result — it
 * invalidates the caches and lets the refetched booking show the truth (§4).
 */

/** Which card-present channel collected the payment (reporting only, §7A.8). */
export type InPersonReaderType = 'tap_to_pay' | 'bluetooth';

/** `POST /charge` response for the card path. */
export interface CardChargeResponse {
  payment_intent_id: string;
  client_secret: string | null;
  amount_pence: number;
}

/** Refresh every surface a payment can change (mirrors invalidateBookingCaches). */
function invalidateAfterPayment(
  queryClient: ReturnType<typeof useQueryClient>,
  accessToken: string | null,
  bookingId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.bookings.detail(accessToken, bookingId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all() });
}

/**
 * Card collection over Stripe Terminal: create the PaymentIntent server-side,
 * then drive the reader through retrieve -> collect -> confirm (§7.7).
 *
 * MUST only be used by a component mounted inside `TerminalProvider` when the
 * Terminal SDK is available (`isTerminalSdkAvailable()`), because it consumes
 * the SDK's `useStripeTerminal` hook. `TakePaymentSheet` enforces that.
 */
export function useTakePayment(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const terminal = getTerminalSdk()!.useStripeTerminal();

  return useMutation({
    mutationFn: async (input: {
      /** One per user-initiated attempt; see `newPaymentAttemptId`. */
      attemptId: string;
      /** Omit to charge the full outstanding balance (when the server knows it). */
      amountPence?: number;
      readerType?: InPersonReaderType;
    }): Promise<{ amountPence: number }> => {
      if (!accessToken) throw new Error('Missing access token');

      // 1. Server creates the card_present PaymentIntent on the venue's account.
      const charge = await apiFetch<CardChargeResponse>(
        `/api/venue/bookings/${bookingId}/charge`,
        {
          accessToken,
          method: 'POST',
          body: JSON.stringify({
            method: 'card_present',
            attempt_id: input.attemptId,
            ...(input.amountPence != null ? { amount_pence: input.amountPence } : {}),
            ...(input.readerType ? { reader_type: input.readerType } : {}),
          }),
        },
      );
      if (!charge.client_secret) {
        throw new Error('The payment could not be started. Please try again.');
      }

      // 2. Hand the intent to the reader.
      const retrieved = await terminal.retrievePaymentIntent(charge.client_secret);
      if (retrieved?.error || !retrieved?.paymentIntent) {
        throw new Error(
          terminalErrorMessage(retrieved?.error, 'The payment could not be started.'),
        );
      }

      // 3. The customer taps/inserts their card here.
      const collected = await terminal.collectPaymentMethod({
        paymentIntent: retrieved.paymentIntent,
      });
      if (collected?.error || !collected?.paymentIntent) {
        throw new Error(terminalErrorMessage(collected?.error, 'The card was not read.'));
      }

      // 4. Confirm. The webhook then writes the paid state.
      const confirmed = await terminal.confirmPaymentIntent({
        paymentIntent: collected.paymentIntent,
      });
      if (confirmed?.error) {
        throw new Error(terminalErrorMessage(confirmed.error, 'The payment was not completed.'));
      }

      return { amountPence: charge.amount_pence };
    },
    onSuccess: () => invalidateAfterPayment(queryClient, accessToken, bookingId),
  });
}

/**
 * Abort an in-flight card collection (staff dismissed the sheet mid-payment).
 *
 * This MUST come from the `useStripeTerminal` hook: the SDK does not re-export
 * `cancelCollectPaymentMethod` from its package root, so a module-level
 * `require(...)` of it resolves to `undefined` and cancels nothing at all.
 */
export function useCancelCardCollection(): () => Promise<void> {
  const terminal = getTerminalSdk()!.useStripeTerminal();
  return async () => {
    try {
      await terminal.cancelCollectPaymentMethod();
    } catch {
      // Nothing was in flight — dismissing is still a no-op, as intended.
    }
  };
}

/** Record cash / other settlement: a ledger row only, no Stripe (§6.3b). */
export function useRecordExternalPayment(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      method: 'cash' | 'external';
      amountPence?: number;
      note?: string;
    }): Promise<{ success: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${bookingId}/charge`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({
          method: input.method,
          ...(input.amountPence != null ? { amount_pence: input.amountPence } : {}),
          ...(input.note ? { note: input.note } : {}),
        }),
      });
    },
    onSuccess: () => invalidateAfterPayment(queryClient, accessToken, bookingId),
  });
}

/** Refund one ledger payment in full (admin only; v1 has no partial refunds). */
export function useRefundPayment(bookingId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { paymentId: string }): Promise<{ success: boolean }> => {
      if (!accessToken) throw new Error('Missing access token');
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${bookingId}/charge`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'refund', payment_id: input.paymentId }),
      });
    },
    onSuccess: () => invalidateAfterPayment(queryClient, accessToken, bookingId),
  });
}
