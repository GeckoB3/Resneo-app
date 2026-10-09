import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiErrorCode } from '@/lib/api/client';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import {
  collectStartedCardPayment,
  SaleCardError,
  type CardCollectHooks,
  type SaleCardResult,
} from '@/lib/payments/useSaleCardPayment';
import { posFetch, posPaths } from '@/lib/pos/api';
import { collectDeviceId } from '@/lib/pos/collect-device';
import { POS_COPY } from '@/lib/pos/copy';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { invalidateAfterSaleWrite } from '@/lib/queries/usePos';
import type { PosClaimResponse, PosCollectState, PosCollectStateResponse } from '@/types/pos';

/**
 * Taking a sale the web till sent to this phone (POS plan §4.36, UX spec §23.5, test plan TTP-09).
 *
 * 1. Claim it: `POST /api/venue/pos/payments/[id]/claim` with `{ device_id, reader_type,
 *    tip_pence }`. Only now does the server make the PaymentIntent, for the amount plus the tip
 *    chosen on this phone, on the venue's existing Terminal Location (D49), which is the Location
 *    the phone's reader already connects to through the connection token. A second phone gets
 *    409 POS_PAYMENT_CLAIMED; the same phone claiming again gets the same PaymentIntent back.
 * 2. Say it is reading the card (`POST .../collect { state: 'collecting' }`), so the till shows
 *    "{name} is taking the card".
 * 3. Collect it exactly as the app's own sale payments do (`collectStartedCardPayment`), with two
 *    differences: a declined or unread card leaves the payment pending, so "Try again" taps the
 *    same PaymentIntent (TQ12); and the five-minute give-up cancels with `reason: 'timed_out'`,
 *    so the till says the phone stopped waiting.
 *
 * Only the webhook marks the payment paid; the desk can cancel at any time, which the collect
 * screen learns from `GET .../collect`.
 */

export type CollectReaderType = 'tap_to_pay' | 'wisepad';

/** The claim answered with a payment that has already ended (paid, cancelled or expired). */
export class CollectEndedError extends Error {
  constructor(readonly collect: PosCollectState) {
    super(collect.status === 'succeeded' ? POS_COPY['app.collect.done'] : POS_COPY['app.collect.gone']);
    this.name = 'CollectEndedError';
  }
}

/** Reads one request's state (`GET .../collect`), which also settles a card a lost webhook left pending. */
export async function readCollectState(accessToken: string, paymentId: string): Promise<PosCollectStateResponse> {
  return posFetch<PosCollectStateResponse>(posPaths.collectState(paymentId), { accessToken });
}

/**
 * Cancels a sale sent to this phone (`POST .../cancel`). `timed_out` is the collector's own
 * five-minute give-up; anything else is a plain cancel. Never throws.
 */
export async function cancelCollectPayment(
  accessToken: string,
  paymentId: string,
  reason?: 'timed_out',
): Promise<'cancelled' | 'went_through' | 'failed'> {
  try {
    await posFetch<{ collect: PosCollectState | null }>(posPaths.collectCancel(paymentId), {
      accessToken,
      method: 'POST',
      body: reason ? { reason } : {},
    });
    return 'cancelled';
  } catch (error) {
    if (apiErrorCode(error) === 'POS_PAYMENT_NOT_PENDING') return 'went_through';
    return 'failed';
  }
}

export type CollectClaimInput = Pick<CardCollectHooks, 'onCardRead' | 'onStarted' | 'shouldStop' | 'askConsent'> & {
  readerType: CollectReaderType;
  tipPence: number;
};

export function useCollectClaimPayment(paymentId: string) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const terminal = getTerminalSdk()!.useStripeTerminal();

  return useMutation({
    mutationFn: async (input: CollectClaimInput): Promise<SaleCardResult & { saleId: string }> => {
      if (!accessToken) throw new Error('Could not confirm you are signed in. Please try again.');
      const deviceId = await collectDeviceId(paymentId);

      // 1. Claim it. Refusals (claimed by someone else, sent to another person, expired) carry the
      //    server's own sentence, which the screen shows word for word.
      const claim = await posFetch<PosClaimResponse>(posPaths.collectClaim(paymentId), {
        accessToken,
        method: 'POST',
        body: { device_id: deviceId, reader_type: input.readerType, tip_pence: Math.max(0, input.tipPence) },
      });
      const collect = claim.collect;
      if (!collect) throw new SaleCardError(POS_COPY['app.card.notCompleted'], 'not_completed', paymentId);
      if (collect.status !== 'pending') throw new CollectEndedError(collect);
      const saleId = collect.sale_id;

      const result = await collectStartedCardPayment({
        terminal,
        started: {
          paymentId,
          amountPence: collect.amount_pence,
          tipPence: collect.tip_pence,
          clientSecret: claim.client_secret,
          alreadyPaid: false,
        },
        cancelOnServer: (reason) => cancelCollectPayment(accessToken, paymentId, reason === 'timed_out' ? 'timed_out' : undefined),
        keepOpenOnDecline: true,
        hooks: {
          ...input,
          // 2. Tell the till this phone is reading the card. Best effort: it only changes the words.
          beforeCollect: async () => {
            try {
              await posFetch(posPaths.collectState(paymentId), {
                accessToken,
                method: 'POST',
                body: { device_id: deviceId, state: 'collecting' },
              });
            } catch (error) {
              if (!(error instanceof ApiError)) console.warn('[pos/collect] could not report collecting:', error);
            }
          },
        },
      });
      return { ...result, saleId };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.collectRequests(accessToken) });
      invalidateAfterSaleWrite(queryClient, { money: true });
    },
  });
}
