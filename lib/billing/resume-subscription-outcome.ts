/**
 * What "Keep my plan" (POST /api/venue/change-plan { resume_subscription })
 * actually did, and therefore what the app should do next.
 *
 * Resuming used to have exactly one success shape: Stripe cleared
 * `cancel_at_period_end` and the subscription carried on. It no longer does.
 * Stripe refuses to revive a subscription that has reached `canceled` or
 * `incomplete_expired`, so the server now falls back to opening a Stripe
 * Checkout session for a BRAND NEW subscription and returns
 * `{ redirect_url }` — with no `message`.
 *
 * The app can reach that path without doing anything wrong: the screen offers
 * "Keep my plan" while the stored billing row says `cancel_at_period_end`, and
 * the real subscription can close underneath it (the period elapses, or a
 * webhook lags). Treating a `redirect_url` as an ordinary success printed
 * "Your subscription will continue." over a resume that had not happened.
 *
 * The distinction matters beyond the wording: a resume restores a subscription
 * the venue already has, but starting a new one is a PURCHASE, and purchases
 * follow the reader-app posture (see `store-billing-policy.ts`) — they belong
 * on the web dashboard, not in a native app.
 */

/** The change-plan response fields this decision reads. */
export interface ResumeSubscriptionResponse {
  redirect_url?: string;
  message?: string;
}

export type ResumeSubscriptionOutcome =
  /** Stripe resumed the existing subscription. Nothing to open. */
  | { kind: 'resumed'; message: string }
  /**
   * The subscription was past reviving, so this is a new purchase and the
   * platform allows buying in-app: open Checkout.
   */
  | { kind: 'checkout'; url: string; message: string }
  /**
   * Same, but the platform is a native storefront: send the admin to the web
   * dashboard instead of opening Checkout.
   */
  | { kind: 'purchase_on_web'; message: string };

/** Copy for a genuine resume when the server sends no message of its own. */
const RESUMED_FALLBACK = 'Your subscription will continue.';

const CHECKOUT_MESSAGE =
  'Complete checkout in the browser — your plan updates here when you return.';

const PURCHASE_ON_WEB_MESSAGE =
  'This subscription has already ended, so keeping your plan means starting a new one. Finish that on the ResNeo website — your plan reactivates here automatically.';

/**
 * Decide what a resume response means.
 *
 * `manageOnWeb` is the reader-app posture for this platform
 * ({@link mustManageSubscriptionOnWeb}); it only affects the purchase paths,
 * because an ordinary resume is not a sale and stays in-app on every platform.
 */
export function resolveResumeSubscriptionOutcome(
  response: ResumeSubscriptionResponse | null | undefined,
  options: { manageOnWeb: boolean },
): ResumeSubscriptionOutcome {
  const redirectUrl = response?.redirect_url?.trim();

  if (redirectUrl) {
    return options.manageOnWeb
      ? { kind: 'purchase_on_web', message: PURCHASE_ON_WEB_MESSAGE }
      : { kind: 'checkout', url: redirectUrl, message: CHECKOUT_MESSAGE };
  }

  const message = response?.message?.trim();
  return { kind: 'resumed', message: message || RESUMED_FALLBACK };
}
