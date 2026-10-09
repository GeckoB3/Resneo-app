import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StripeError } from '@stripe/stripe-terminal-react-native';

import { ApiError, apiErrorCode } from '@/lib/api/client';
import { cardOutcomeOf, cardSummaryOf, type CardSummary } from '@/lib/payments/card-outcome';
import { getTerminalSdk, isDefiniteCardFailure, terminalErrorMessage } from '@/lib/payments/terminal-sdk';
import { posFetch, posPaths, saleFromErrorBody, staleSaleFrom } from '@/lib/pos/api';
import { POS_COPY } from '@/lib/pos/copy';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { invalidateAfterSaleWrite, SaleStaleError, type SaleWriteResult } from '@/lib/queries/usePos';
import type { PosSale } from '@/types/pos';

/**
 * The card collector for sales (POS plan P7-1 and §4.4.3, the app code map's F2): Tap to Pay on
 * this phone or the Bluetooth WisePad 3, charged through the sale API instead of a booking's
 * `/charge`.
 *
 * It is built BESIDE the booking payment path (`lib/queries/useTakePayment.ts`), which stays
 * exactly as it is for venues without POS; the two share only the Stripe Terminal driver
 * (`terminal-sdk.ts`, and the reader hooks in `terminal.ts` and `bluetoothReader.ts`).
 *
 * 1. `POST /api/venue/pos/sales/[id]/payments` with `method: 'card_app'` locks the sale with a
 *    pending payment and returns the PaymentIntent's client secret.
 * 2. The Terminal SDK retrieves, collects and confirms it. Nothing here marks the sale paid: the
 *    webhook (or the sale read's self-heal) settles it, and the sale is read again.
 * 3. The collector gives up after five minutes ({@link SALE_CARD_COLLECT_TIMEOUT_MS}, plan §4.4.8)
 *    and cancels its own attempt with `POST .../payments/[paymentId]/cancel`, which is what makes
 *    the server's 15-minute sweep safe. It also cancels when staff cancel, and when the reader says
 *    for certain that no money moved (a decline, a card that was never read). An ambiguous failure
 *    (the network dropped after the card was accepted) is never cancelled: the payment may have
 *    gone through, and the sale shows it by itself if it did.
 */

/** The new sale collector gives up waiting for a card after five minutes (plan §4.4.8). */
export const SALE_CARD_COLLECT_TIMEOUT_MS = 5 * 60_000;

export type SaleCardFailureKind = 'declined' | 'timed_out' | 'cancelled' | 'not_completed' | 'unsure';

/** A card attempt that did not take money (or might have: `unsure`), with the sentence to show. */
export class SaleCardError extends Error {
  constructor(
    message: string,
    readonly kind: SaleCardFailureKind,
    readonly paymentId: string | null,
  ) {
    super(message);
    this.name = 'SaleCardError';
  }
}

export type SaleCardResult = {
  paymentId: string;
  amountPence: number;
  tipPence: number;
  card: CardSummary | null;
  /** True when the server already had this payment as paid (a replay, or a cancel that lost the race). */
  alreadyPaid: boolean;
};

export type SaleCardInput = {
  /** One per tap of the pay button (`newPaymentAttemptId`), so a double tap makes one payment. */
  clientRequestId: string;
  version: number;
  amountPence: number;
  tipPence: number;
  /** The card has been read; Stripe is confirming. */
  onCardRead?: () => void;
  /** The server made the payment: staff can now cancel it. */
  onStarted?: (paymentId: string) => void;
  /** Staff cancelled while the payment was being made: release it before any card is asked for. */
  shouldStop?: () => boolean;
};

/**
 * Cancels a pending sale card payment on the server. Never throws. Answers `went_through` when the
 * server found the payment had in fact succeeded (409 POS_PAYMENT_NOT_PENDING), with the sale.
 */
export async function cancelSaleCardPayment(args: {
  accessToken: string;
  saleId: string;
  paymentId: string;
}): Promise<{ outcome: 'cancelled' | 'went_through' | 'failed'; sale: PosSale | null }> {
  try {
    const res = await posFetch<SaleWriteResult>(posPaths.cancelPayment(args.saleId, args.paymentId), {
      accessToken: args.accessToken,
      method: 'POST',
      body: {},
    });
    return { outcome: 'cancelled', sale: res.sale ?? null };
  } catch (error) {
    if (apiErrorCode(error) === 'POS_PAYMENT_NOT_PENDING') {
      return { outcome: 'went_through', sale: saleFromErrorBody(error) };
    }
    return { outcome: 'failed', sale: null };
  }
}

export function useSaleCardPayment(saleId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const terminal = getTerminalSdk()!.useStripeTerminal();
  const saleKey = queryKeys.pos.sale(accessToken, saleId);

  return useMutation({
    mutationFn: async (input: SaleCardInput): Promise<SaleCardResult> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');

      // 1. The server locks the sale and makes the PaymentIntent.
      let started: SaleWriteResult;
      try {
        started = await posFetch<SaleWriteResult>(posPaths.saleAction(saleId, 'payments'), {
          accessToken,
          method: 'POST',
          body: {
            version: input.version,
            client_request_id: input.clientRequestId,
            method: 'card_app',
            amount_pence: input.amountPence,
            ...(input.tipPence > 0 ? { tip_pence: input.tipPence } : {}),
          },
        });
      } catch (error) {
        const fresh = staleSaleFrom(error);
        if (fresh) {
          queryClient.setQueryData(saleKey, fresh);
          throw new SaleStaleError(POS_COPY['stale.notice'], fresh);
        }
        throw error;
      }
      if (started.sale) queryClient.setQueryData(saleKey, started.sale);
      const payment = started.payment ?? null;
      if (!payment) throw new SaleCardError(POS_COPY['app.card.notCompleted'], 'not_completed', null);
      const result = (alreadyPaid: boolean, card: CardSummary | null): SaleCardResult => ({
        paymentId: payment.id,
        amountPence: payment.amount_pence,
        tipPence: payment.tip_pence,
        card,
        alreadyPaid,
      });
      // A replay of a payment that already went through.
      if (payment.status === 'succeeded') return result(true, null);
      if (!started.client_secret) throw new SaleCardError(POS_COPY['app.card.notCompleted'], 'not_completed', payment.id);

      const cancelOnServer = async () => {
        const out = await cancelSaleCardPayment({ accessToken, saleId, paymentId: payment.id });
        if (out.sale) queryClient.setQueryData(saleKey, out.sale);
        return out.outcome;
      };

      if (input.shouldStop?.()) {
        const outcome = await cancelOnServer();
        if (outcome === 'went_through') return result(true, null);
        throw new SaleCardError(POS_COPY['app.card.cancelled'], 'cancelled', payment.id);
      }
      input.onStarted?.(payment.id);

      // 2. Five minutes to read a card; then the collector stops and cancels its own attempt.
      let timedOut = false;
      let confirming = false;
      const timer = setTimeout(() => {
        if (confirming) return;
        timedOut = true;
        void Promise.resolve(terminal.cancelCollectPaymentMethod()).catch(() => undefined);
      }, SALE_CARD_COLLECT_TIMEOUT_MS);

      /** No money moved for certain: release the sale, then say how it ended. */
      const failDefinitely = async (error: StripeError | undefined, fallback: string): Promise<never> => {
        const outcome = await cancelOnServer();
        if (outcome === 'went_through') throw new WentThrough();
        if (timedOut) throw new SaleCardError(POS_COPY['app.charge.timedOut'], 'timed_out', payment.id);
        if (error?.code === 'CANCELED') throw new SaleCardError(POS_COPY['app.card.cancelled'], 'cancelled', payment.id);
        const kind = cardOutcomeOf(error);
        if (kind === 'declined') {
          throw new SaleCardError(terminalErrorMessage(error, POS_COPY['app.card.declined']), 'declined', payment.id);
        }
        throw new SaleCardError(terminalErrorMessage(error, fallback), 'not_completed', payment.id);
      };

      try {
        const retrieved = await terminal.retrievePaymentIntent(started.client_secret);
        if (retrieved?.error || !retrieved?.paymentIntent) {
          return await failDefinitely(retrieved?.error, POS_COPY['app.card.notCompleted']);
        }
        const collected = await terminal.collectPaymentMethod({ paymentIntent: retrieved.paymentIntent });
        if (timedOut || collected?.error || !collected?.paymentIntent) {
          // Collecting had not finished, so no payment method was attached: nothing can have moved.
          return await failDefinitely(collected?.error, POS_COPY['app.card.notCompleted']);
        }
        confirming = true;
        clearTimeout(timer);
        input.onCardRead?.();

        // 3. Confirm. The webhook writes the paid state.
        const confirmed = await terminal.confirmPaymentIntent({ paymentIntent: collected.paymentIntent });
        if (confirmed?.error) {
          if (isDefiniteCardFailure(confirmed.error)) {
            return await failDefinitely(confirmed.error, POS_COPY['app.card.notCompleted']);
          }
          throw new SaleCardError(POS_COPY['app.card.unsure'], 'unsure', payment.id);
        }
        return result(false, cardSummaryOf(confirmed?.paymentIntent ?? collected.paymentIntent));
      } catch (error) {
        if (error instanceof WentThrough) return result(true, null);
        if (error instanceof SaleCardError) throw error;
        // Anything unexpected after the card may have been read is treated as "we can't be sure".
        throw new SaleCardError(
          error instanceof ApiError ? error.message : POS_COPY['app.card.unsure'],
          confirming ? 'unsure' : 'not_completed',
          payment.id,
        );
      } finally {
        clearTimeout(timer);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: saleKey });
      invalidateAfterSaleWrite(queryClient, { money: true });
    },
  });
}

/** Internal: the server's cancel found the payment had gone through. */
class WentThrough extends Error {}
