import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StripeError } from '@stripe/stripe-terminal-react-native';

import { ApiError, apiErrorCode } from '@/lib/api/client';
import { cardOutcomeOf, cardSummaryOf, type CardSummary } from '@/lib/payments/card-outcome';
import {
  getTerminalSdk,
  isDefiniteCardFailure,
  terminalErrorMessage,
  type TerminalHookApi,
} from '@/lib/payments/terminal-sdk';
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
 *    pending payment and returns the PaymentIntent's client secret. (A sale sent from the web
 *    till to this phone gets its client secret from the claim instead, plan §4.36: see
 *    `useCollectClaimPayment` in `lib/payments/useCollectPayment.ts`; the steps below are shared.)
 * 2. Optionally (app step 2, plan §4.4.5): with cards on file on and a client on the sale, the
 *    client is asked on this phone whether to save their card (`askConsent`). A yes gives the
 *    PaymentIntent the client's customer on the server, and the card is collected with
 *    `allowRedisplay: 'always'`.
 * 3. The Terminal SDK retrieves, collects and confirms it. Nothing here marks the sale paid: the
 *    webhook (or the sale read's self-heal) settles it, and the sale is read again.
 * 4. The collector gives up after five minutes ({@link SALE_CARD_COLLECT_TIMEOUT_MS}, plan §4.4.8)
 *    and cancels its own attempt, which is what makes the server's 15-minute sweep safe. It also
 *    cancels when staff cancel, and when the reader says for certain that no money moved (a
 *    decline, a card that was never read), unless the caller keeps the payment open after a
 *    decline so the same PaymentIntent can be tried again (a sale sent to a phone, TQ12). An
 *    ambiguous failure (the network dropped after the card was accepted) is never cancelled: the
 *    payment may have gone through, and the sale shows it by itself if it did.
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
    /** The SDK's error code and the bank's decline code, when there were any. */
    readonly codes: { code: string | null; declineCode: string | null } = { code: null, declineCode: null },
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
  /** The client's answer about saving the card, when they were asked (`null` when not asked). */
  cardSave: 'agreed' | 'declined' | null;
};

export type SaleCardInput = {
  /** One per tap of the pay button (`newPaymentAttemptId`), so a double tap makes one payment. */
  clientRequestId: string;
  version: number;
  amountPence: number;
  tipPence: number;
  /**
   * Which reader takes it (app step 2): sent as `reader_type` so the web can record it. A server
   * that does not read it yet ignores it (the body schema drops unknown keys).
   */
  readerType?: 'tap_to_pay' | 'wisepad';
  /** The card has been read; Stripe is confirming. */
  onCardRead?: () => void;
  /** The server made the payment: staff can now cancel it. */
  onStarted?: (paymentId: string) => void;
  /** Staff cancelled while the payment was being made: release it before any card is asked for. */
  shouldStop?: () => boolean;
  /**
   * Ask the client whether to save their card (app step 2), once the payment exists and before
   * the card is read. Resolves 'agreed' (collect with `allowRedisplay: 'always'`), 'declined', or
   * null when nothing was asked. Leave it out where cards on file do not apply.
   */
  askConsent?: (paymentId: string) => Promise<'agreed' | 'declined' | null>;
};

/** The started payment the shared steps collect. */
export type StartedCardPayment = {
  paymentId: string;
  amountPence: number;
  tipPence: number;
  clientSecret: string | null;
  /** The server already has it as paid (a replay). */
  alreadyPaid: boolean;
};

export type CardCollectHooks = Pick<SaleCardInput, 'onCardRead' | 'onStarted' | 'shouldStop' | 'askConsent'> & {
  /** Just before the card is asked for (a sale sent to a phone reports `collecting`). */
  beforeCollect?: (paymentId: string) => void | Promise<void>;
};

type CardTerminal = Pick<
  TerminalHookApi,
  'retrievePaymentIntent' | 'collectPaymentMethod' | 'confirmPaymentIntent' | 'cancelCollectPaymentMethod'
>;

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

function codesOf(error: StripeError | undefined): { code: string | null; declineCode: string | null } {
  const e = error as (StripeError & { apiError?: { declineCode?: string | null; code?: string | null } | null }) | undefined;
  return {
    code: typeof e?.code === 'string' ? e.code : null,
    declineCode: typeof e?.apiError?.declineCode === 'string' ? e.apiError.declineCode : null,
  };
}

/**
 * Steps 2 to 4 above, for a payment the server has started: consent, retrieve, collect, confirm,
 * with the five-minute give-up. `cancelOnServer` releases the payment; `keepOpenOnDecline` leaves
 * a declined or unread card's payment pending so it can be tried again (a sale sent to a phone).
 */
export async function collectStartedCardPayment(args: {
  terminal: CardTerminal;
  started: StartedCardPayment;
  cancelOnServer: (reason: 'timed_out' | 'stopped') => Promise<'cancelled' | 'went_through' | 'failed'>;
  keepOpenOnDecline?: boolean;
  hooks?: CardCollectHooks;
}): Promise<SaleCardResult> {
  const { terminal, started } = args;
  const hooks = args.hooks ?? {};
  const result = (alreadyPaid: boolean, card: CardSummary | null, cardSave: SaleCardResult['cardSave'] = null): SaleCardResult => ({
    paymentId: started.paymentId,
    amountPence: started.amountPence,
    tipPence: started.tipPence,
    card,
    alreadyPaid,
    cardSave,
  });
  if (started.alreadyPaid) return result(true, null);
  if (!started.clientSecret) {
    throw new SaleCardError(POS_COPY['app.card.notCompleted'], 'not_completed', started.paymentId);
  }
  const clientSecret = started.clientSecret;

  if (hooks.shouldStop?.()) {
    const outcome = await args.cancelOnServer('stopped');
    if (outcome === 'went_through') return result(true, null);
    throw new SaleCardError(POS_COPY['app.card.cancelled'], 'cancelled', started.paymentId);
  }
  hooks.onStarted?.(started.paymentId);

  // Five minutes to read a card (the consent question included); then the collector stops and
  // cancels its own attempt.
  let timedOut = false;
  let confirming = false;
  let wakeConsent: (() => void) | null = null;
  const timer = setTimeout(() => {
    if (confirming) return;
    timedOut = true;
    wakeConsent?.();
    void Promise.resolve(terminal.cancelCollectPaymentMethod()).catch(() => undefined);
  }, SALE_CARD_COLLECT_TIMEOUT_MS);

  /** No money moved for certain: release the payment (or keep it open), then say how it ended. */
  const failDefinitely = async (error: StripeError | undefined, fallback: string): Promise<never> => {
    const codes = codesOf(error);
    const staffCancelled = !timedOut && error?.code === 'CANCELED';
    if (args.keepOpenOnDecline && !timedOut && !staffCancelled) {
      const kind = cardOutcomeOf(error) === 'declined' ? 'declined' : 'not_completed';
      throw new SaleCardError(
        terminalErrorMessage(error, kind === 'declined' ? POS_COPY['app.collect.declined'] : fallback),
        kind,
        started.paymentId,
        codes,
      );
    }
    const outcome = await args.cancelOnServer(timedOut ? 'timed_out' : 'stopped');
    if (outcome === 'went_through') throw new WentThrough();
    if (timedOut) throw new SaleCardError(POS_COPY['app.charge.timedOut'], 'timed_out', started.paymentId, codes);
    if (staffCancelled) throw new SaleCardError(POS_COPY['app.card.cancelled'], 'cancelled', started.paymentId, codes);
    if (cardOutcomeOf(error) === 'declined') {
      throw new SaleCardError(terminalErrorMessage(error, POS_COPY['app.card.declined']), 'declined', started.paymentId, codes);
    }
    throw new SaleCardError(terminalErrorMessage(error, fallback), 'not_completed', started.paymentId, codes);
  };

  let cardSave: SaleCardResult['cardSave'] = null;
  try {
    if (hooks.askConsent) {
      const ask = hooks.askConsent;
      cardSave = await new Promise<SaleCardResult['cardSave']>((resolve) => {
        wakeConsent = () => resolve(null);
        ask(started.paymentId).then(resolve, () => resolve(null));
      });
      wakeConsent = null;
      if (timedOut) return await failDefinitely(undefined, POS_COPY['app.card.notCompleted']);
      // Staff cancelled while the client was answering: release it before any card is asked for.
      if (hooks.shouldStop?.()) {
        const outcome = await args.cancelOnServer('stopped');
        if (outcome === 'went_through') return result(true, null, cardSave);
        throw new SaleCardError(POS_COPY['app.card.cancelled'], 'cancelled', started.paymentId);
      }
    }

    // Retrieved after the consent answer, so a yes (the client's customer on the PaymentIntent)
    // is what the SDK collects against.
    const retrieved = await terminal.retrievePaymentIntent(clientSecret);
    if (retrieved?.error || !retrieved?.paymentIntent) {
      return await failDefinitely(retrieved?.error, POS_COPY['app.card.notCompleted']);
    }
    await hooks.beforeCollect?.(started.paymentId);
    const collected = await terminal.collectPaymentMethod({
      paymentIntent: retrieved.paymentIntent,
      ...(cardSave === 'agreed' ? { allowRedisplay: 'always' as const } : {}),
    });
    if (timedOut || collected?.error || !collected?.paymentIntent) {
      // Collecting had not finished, so no payment method was attached: nothing can have moved.
      return await failDefinitely(collected?.error, POS_COPY['app.card.notCompleted']);
    }
    confirming = true;
    clearTimeout(timer);
    hooks.onCardRead?.();

    // Confirm. The webhook writes the paid state.
    const confirmed = await terminal.confirmPaymentIntent({ paymentIntent: collected.paymentIntent });
    if (confirmed?.error) {
      if (isDefiniteCardFailure(confirmed.error)) {
        return await failDefinitely(confirmed.error, POS_COPY['app.card.notCompleted']);
      }
      throw new SaleCardError(POS_COPY['app.card.unsure'], 'unsure', started.paymentId, codesOf(confirmed.error));
    }
    return result(false, cardSummaryOf(confirmed?.paymentIntent ?? collected.paymentIntent), cardSave);
  } catch (error) {
    if (error instanceof WentThrough) return result(true, null, cardSave);
    if (error instanceof SaleCardError) throw error;
    // Anything unexpected after the card may have been read is treated as "we can't be sure".
    throw new SaleCardError(
      error instanceof ApiError ? error.message : POS_COPY['app.card.unsure'],
      confirming ? 'unsure' : 'not_completed',
      started.paymentId,
    );
  } finally {
    clearTimeout(timer);
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
            ...(input.readerType ? { reader_type: input.readerType } : {}),
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

      const cancelOnServer = async () => {
        const out = await cancelSaleCardPayment({ accessToken, saleId, paymentId: payment.id });
        if (out.sale) queryClient.setQueryData(saleKey, out.sale);
        return out.outcome;
      };

      // 2 to 4. Consent, then retrieve, collect and confirm, with the five-minute give-up.
      return collectStartedCardPayment({
        terminal,
        started: {
          paymentId: payment.id,
          amountPence: payment.amount_pence,
          tipPence: payment.tip_pence,
          clientSecret: started.client_secret ?? null,
          // A replay of a payment that already went through.
          alreadyPaid: payment.status === 'succeeded',
        },
        cancelOnServer,
        hooks: input,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: saleKey });
      invalidateAfterSaleWrite(queryClient, { money: true });
    },
  });
}

/** Internal: the server's cancel found the payment had gone through. */
class WentThrough extends Error {}
