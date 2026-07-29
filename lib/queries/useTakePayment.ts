import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StripeError } from '@stripe/stripe-terminal-react-native';

import { apiFetch } from '@/lib/api/client';
import { recordFailedCardAttempt } from '@/lib/payments/failed-attempts';
import {
  getTerminalSdk,
  isDefiniteCardFailure,
  terminalErrorMessage,
} from '@/lib/payments/terminal-sdk';
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
      // Staff-facing: this surfaces raw in the payment sheet, so it must read as
      // something a salon can act on rather than as an internal token error.
      if (!accessToken) {
        throw new Error('Could not confirm you are signed in. Please try again.');
      }

      // Read before the POST: the ledger row is created inside it, so this is the
      // earliest instant the row could carry (see `recordFailedCardAttempt`).
      const startedAtMs = Date.now();

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

      /**
       * The pending ledger row now EXISTS, and only the Stripe webhook can move
       * it off `pending`. So whenever the reader tells us the money definitely did
       * not move, record that here: it is the only thing standing between a
       * declined tap and the sheet warning "a card payment is still going through"
       * until the (possibly never-arriving) `payment_failed` webhook lands.
       *
       * `isDefiniteCardFailure` is deliberately strict — an ambiguous confirm
       * (network drop after the reader accepted) is NOT recorded, because Stripe
       * may have captured it and staff must keep being warned.
       */
      const reportFailure = (error: StripeError | undefined, message: string): never => {
        if (isDefiniteCardFailure(error)) {
          recordFailedCardAttempt({
            bookingId,
            paymentIntentId: charge.payment_intent_id,
            amountPence: charge.amount_pence,
            startedAtMs,
            failedAtMs: Date.now(),
          });
        }
        throw new Error(message);
      };

      // 2. Hand the intent to the reader.
      const retrieved = await terminal.retrievePaymentIntent(charge.client_secret);
      if (retrieved?.error || !retrieved?.paymentIntent) {
        return reportFailure(
          retrieved?.error,
          terminalErrorMessage(retrieved?.error, 'The payment could not be started.'),
        );
      }

      // 3. The customer taps/inserts their card here.
      const collected = await terminal.collectPaymentMethod({
        paymentIntent: retrieved.paymentIntent,
      });
      if (collected?.error || !collected?.paymentIntent) {
        return reportFailure(
          collected?.error,
          terminalErrorMessage(collected?.error, 'The card was not read.'),
        );
      }

      // 4. Confirm. The webhook then writes the paid state.
      const confirmed = await terminal.confirmPaymentIntent({
        paymentIntent: collected.paymentIntent,
      });
      if (confirmed?.error) {
        return reportFailure(
          confirmed.error,
          terminalErrorMessage(confirmed.error, 'The payment was not completed.'),
        );
      }

      return { amountPence: charge.amount_pence };
    },
    onSuccess: () => invalidateAfterPayment(queryClient, accessToken, bookingId),
    /**
     * Failures need the refetch just as much as successes do. A decline writes
     * nothing itself, but the `payment_intent.payment_failed` webhook flips the pending
     * row to `failed` moments later, and without an invalidation here the sheet's
     * live `target.payments` (and the booking behind it) kept showing the row as
     * Processing until some unrelated refetch happened to run.
     */
    onError: () => invalidateAfterPayment(queryClient, accessToken, bookingId),
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
      // Staff-facing: this surfaces raw in the payment sheet, so it must read as
      // something a salon can act on rather than as an internal token error.
      if (!accessToken) {
        throw new Error('Could not confirm you are signed in. Please try again.');
      }
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
    mutationFn: async (input: {
      paymentId: string;
      /**
       * The booking the ledger row is ANCHORED to. Defaults to the opened
       * booking, which is right for a standalone appointment.
       */
      paymentBookingId?: string | null;
    }): Promise<{ success: boolean }> => {
      // Staff-facing: this surfaces raw in the payment sheet, so it must read as
      // something a salon can act on rather than as an internal token error.
      if (!accessToken) {
        throw new Error('Could not confirm you are signed in. Please try again.');
      }
      /**
       * §5.7 — `payments[]` is VISIT-wide, so a row shown on this booking may
       * have been collected on a different service of the same visit. The
       * refund route looks the row up scoped to the booking in the URL
       * (`.eq('booking_id', id)`), so posting a sibling's row to the opened
       * booking 409s "This payment cannot be refunded". Route it to the row's
       * own booking instead.
       */
      const anchorBookingId = input.paymentBookingId ?? bookingId;
      return apiFetch<{ success: boolean }>(`/api/venue/bookings/${anchorBookingId}/charge`, {
        accessToken,
        method: 'POST',
        body: JSON.stringify({ action: 'refund', payment_id: input.paymentId }),
      });
    },
    onSuccess: () => invalidateAfterPayment(queryClient, accessToken, bookingId),
  });
}
