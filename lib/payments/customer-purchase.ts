import { apiFetch } from '@/lib/api/client';

/**
 * Buying something as a customer: the part that has nothing to do with Stripe's
 * SDK.
 *
 * All four money routes return a `client_secret` rather than a hosted Checkout
 * URL. The web's P0-17 converted the last of them for exactly the reason that
 * matters here: a hosted `success_url` opened in an app webview carries no
 * cookie, so it resolved no user and showed a freshly-charged customer a
 * sign-in page.
 *
 * **The SDK is deliberately not imported in this file.** Confirming a card is
 * one call into a native module that cannot be exercised in a test or on the
 * web; everything around it, which is where the mistakes live, is ordinary
 * async code. Keeping the two apart means the untestable surface is a single
 * adapter rather than the whole flow.
 */

/** What a money route hands back so a client can take payment. */
export interface PaymentIntentTicket {
  client_secret: string;
  /**
   * The venue's own Stripe account.
   *
   * Every venue is a separate connected account, so the Payment Element has to
   * be scoped per venue rather than configured once for the app. A customer
   * with three venues is paying three different Stripe accounts.
   */
  stripe_account_id: string;
  setup_intent_id?: string;
}

export type PurchaseKind = 'membership' | 'credits' | 'course' | 'save_card';

/** Which route starts each kind of purchase. Unaliased paths, per D3. */
const START_PATH: Record<PurchaseKind, string> = {
  membership: '/api/account/memberships/checkout',
  credits: '/api/account/credits/purchase',
  course: '/api/account/courses/checkout',
  save_card: '/api/account/payment-methods/setup-intent',
};

export interface StartPurchaseArgs {
  kind: PurchaseKind;
  accessToken: string;
  venueId: string;
  /** The membership product, credit pack or course being bought. */
  productId?: string;
}

/**
 * Ask the server to open a payment, and get back what the card sheet needs.
 *
 * Nothing is charged here. The customer has not seen a card field yet, and this
 * step exists so the venue's own Stripe account and the amount are settled by
 * the server rather than proposed by the client.
 */
export async function startPurchase(args: StartPurchaseArgs): Promise<PaymentIntentTicket> {
  const { kind, accessToken, venueId, productId } = args;
  const body: Record<string, unknown> = { venue_id: venueId };
  if (productId) body.product_id = productId;

  const ticket = await apiFetch<PaymentIntentTicket>(START_PATH[kind], {
    accessToken,
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!ticket?.client_secret || !ticket?.stripe_account_id) {
    /*
      Fail here rather than handing a half-formed ticket to the card sheet. A
      Payment Element opened against the wrong account, or none, either refuses
      in a way the customer cannot act on or charges the wrong venue.
    */
    throw new Error('The venue could not start this payment.');
  }

  return ticket;
}

/**
 * What the server does AFTER the card is confirmed, and why the client does not
 * do it.
 *
 * The subscription, the credit grant and the course place are all created
 * server-side from the Stripe webhook, not from a second call the client makes.
 * The card is already saved by the time the sheet closes, so a client that lost
 * its connection between confirming and calling back would leave a customer
 * with a charged card and nothing bought, and nothing to reconcile it from. The
 * webhook is the only participant guaranteed to run.
 *
 * So there is nothing to send. This exists to be read, not called.
 */
export const PURCHASE_IS_COMPLETED_BY_WEBHOOK = true;

/**
 * How long to keep asking whether the webhook has landed.
 *
 * The sheet closes before the subscription exists, so the screen refetches for
 * a few seconds rather than claiming success it cannot see. Bounded, because a
 * spinner that never stops is worse than a sentence saying it is on its way.
 */
export const WEBHOOK_SETTLE_ATTEMPTS = 5;
export const WEBHOOK_SETTLE_INTERVAL_MS = 1500;
