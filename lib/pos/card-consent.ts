import { posFetch, posPaths } from '@/lib/pos/api';
import type { PosCardConsentAnswer, PosCardConsentInfo, PosCardSaveStatus } from '@/types/pos';

/**
 * Saving a card on the phone, with the client's consent (POS plan §4.4.5, D18; UX spec §13.4
 * "Saving a card on the phone"; web `.../payments/[paymentId]/card-consent`).
 *
 * The question is asked after the payment exists (so the server can attach the client's Stripe
 * customer to its PaymentIntent) and before the card is read. The client, not staff, answers on
 * the screen handed to them; the words they saw go back with the answer. The first answer stands.
 * Once the payment succeeds, the server keeps the card only if Stripe returned a reusable one
 * (`card_save_status` becomes `saved` or `not_saved`).
 */

/** Whether this payment can save a card, and the words to show. Null when it cannot be asked. */
export async function readCardConsent(accessToken: string, saleId: string, paymentId: string): Promise<PosCardConsentInfo | null> {
  try {
    const info = await posFetch<PosCardConsentInfo>(posPaths.cardConsent(saleId, paymentId), { accessToken });
    return info?.can_save && info.consent_text?.trim() ? info : null;
  } catch {
    // An older server, or the setting just went off: take the payment without asking.
    return null;
  }
}

/** Records the client's answer. Throws the server's refusal (409 with its sentence) for the caller to show. */
export async function answerCardConsent(
  accessToken: string,
  saleId: string,
  paymentId: string,
  answer: { agreed: boolean; consentText: string },
): Promise<PosCardConsentAnswer> {
  return posFetch<PosCardConsentAnswer>(posPaths.cardConsent(saleId, paymentId), {
    accessToken,
    method: 'POST',
    body: { agreed: answer.agreed, consent_text: answer.consentText.slice(0, 1000) },
  });
}

const FINAL: PosCardSaveStatus[] = ['saved', 'not_saved', 'failed', 'declined'];

/**
 * After a paid card payment the client agreed to save: waits a few seconds for the webhook to say
 * whether the card was kept. Answers the last status seen (still `agreed` if the webhook is slow,
 * in which case nothing is said). Never throws.
 */
export async function followCardSave(
  accessToken: string,
  saleId: string,
  paymentId: string,
  opts: { tries?: number; intervalMs?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<PosCardSaveStatus | null> {
  const tries = opts.tries ?? 4;
  const interval = opts.intervalMs ?? 2_500;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last: PosCardSaveStatus | null = null;
  for (let i = 0; i < tries; i += 1) {
    await wait(interval);
    try {
      const info = await posFetch<PosCardConsentInfo>(posPaths.cardConsent(saleId, paymentId), { accessToken });
      last = info?.card_save_status ?? last;
      if (last && FINAL.includes(last)) return last;
    } catch {
      return last;
    }
  }
  return last;
}

/** The copy id that says what happened to a card the client was asked to save, or null for nothing. */
export function cardSaveCopyId(status: PosCardSaveStatus | null): 'reader.saved' | 'reader.notSaved' | 'reader.notSaved.wallet' | null {
  switch (status) {
    case 'saved':
      return 'reader.saved';
    case 'declined':
      return 'reader.notSaved';
    case 'not_saved':
    case 'failed':
      return 'reader.notSaved.wallet';
    default:
      return null;
  }
}
