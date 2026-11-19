/**
 * Saving a card on file from the customer's account (web Docs/card-on-file-plan.md §4.6 way 4,
 * §5.2): the card sheet on the platform account, then the confirm. Kept apart from
 * `useAccountCards` because it loads the native card SDK, which screens that only list or remove
 * cards (and their tests) do not need.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiFetch } from '@/lib/api/client';
import { presentCardSheet, type CardSheetResult } from '@/lib/payments/customer-card-sheet';
import type { PaymentIntentTicket } from '@/lib/payments/customer-purchase';
import type { AccountCardSetup } from '@/lib/queries/useAccountCards';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';

export type SaveAccountCardOutcome =
  | { status: 'saved'; label: string | null; securedBookings: number }
  /** Stripe is still working on it: the card shows up shortly. */
  | { status: 'pending' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

type ConfirmBody =
  | { confirmed: true; card?: { brand: string | null; last4: string | null }; secured_bookings?: number }
  | { confirmed: false; setup_status?: string };

/** How many times the confirm is asked while Stripe finishes, and how long apart. */
export const CONFIRM_ATTEMPTS = 4;
const CONFIRM_GAP_MS = 1500;

/**
 * Show the card sheet for a set-up, then save the card on file. The confirm is asked again a few
 * times while Stripe still reports the set-up as processing; the platform webhook finishes it in
 * any case, so "pending" is not a failure.
 */
export function useSaveAccountCard(
  /** Seams for tests: the card sheet is a native module, and the wait is real time. */
  showCardSheet: (args: {
    ticket: PaymentIntentTicket;
    venueName: string;
    isSetupIntent: boolean;
  }) => Promise<CardSheetResult> = presentCardSheet,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (setup: AccountCardSetup): Promise<SaveAccountCardOutcome> => {
      if (!accessToken) throw new Error('Missing access token');
      const sheet = await showCardSheet({
        // No connected account: the card is saved on the platform.
        ticket: { client_secret: setup.client_secret, stripe_account_id: '', setup_intent_id: setup.setup_intent_id },
        venueName: setup.scope_name || 'ResNeo',
        isSetupIntent: true,
      });
      if (sheet.status === 'cancelled') return { status: 'cancelled' };
      if (sheet.status === 'failed') return { status: 'failed', message: sheet.message };

      // Stripe has the card from here on, and the platform webhook saves it whatever the confirm
      // answers. A dropped connection or a server error used to reject, and the customer read "We
      // could not save your card" for a card that was saved (2026-11-19): it is asked again, and
      // after the last try the card is "being saved" rather than failed.
      for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS; attempt += 1) {
        let body: ConfirmBody;
        try {
          body = await apiFetch<ConfirmBody>('/api/v1/me/payment-methods/card-on-file/confirm', {
            accessToken,
            method: 'POST',
            body: JSON.stringify({ setup_intent_id: setup.setup_intent_id }),
          });
        } catch (error) {
          if (!isPassingConfirmError(error)) throw error;
          if (attempt < CONFIRM_ATTEMPTS) await wait(CONFIRM_GAP_MS);
          continue;
        }
        if (body.confirmed) {
          const card = body.card;
          return {
            status: 'saved',
            label: card?.last4 ? cardWords(card.brand, card.last4) : null,
            securedBookings: body.secured_bookings ?? 0,
          };
        }
        if (attempt < CONFIRM_ATTEMPTS) await wait(CONFIRM_GAP_MS);
      }
      return { status: 'pending' };
    },
    onSuccess: (outcome) => {
      if (outcome.status === 'saved' || outcome.status === 'pending') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.customer.all() });
      }
    },
  });
}

/**
 * A confirm that did not get an answer, rather than one refused: no connection or a timeout (status
 * 0), too many requests, or a server error. Anything else (a 4xx) is a real refusal.
 */
export function isPassingConfirmError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 0 || error.status === 429 || error.status >= 500;
  // Not an answer from the server at all (a fetch that threw).
  return true;
}

function cardWords(brand: string | null, last4: string): string {
  const b = (brand ?? '').toLowerCase();
  const names: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };
  const name = names[b] ?? (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
  return `${name} ending ${last4}`;
}
