/**
 * The app's side of the web's `/stripe-return` page (owner, 2026-10-22). Stripe onboarding started
 * in the app comes back to that page, which moves on to this app link, `resneo://stripe-return`
 * (Expo Go's own link in a device test) with `status=done` (finished or left) or `status=expired`
 * (the link ran out). The auth session that opened Stripe is waiting for exactly that link, so its
 * window closes.
 *
 * Pure, with no imports, because `+native-intent` uses it before the app exists: on Android the
 * same link also reaches Expo Router, which has no screen for it, so it is dropped there.
 */

export const STRIPE_RETURN_ROUTE = 'stripe-return';

export type StripeReturnStatus = 'done' | 'expired';

/** The status the web page put on the link; anything else counts as done. */
export function stripeReturnStatus(url: string): StripeReturnStatus {
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  for (const pair of query.split('&')) {
    const [key, value] = pair.split('=');
    if (key === 'status' && value === 'expired') return 'expired';
  }
  return 'done';
}

/**
 * Whether an incoming link is the Stripe return: `resneo://stripe-return?...`, Expo Go's
 * `exp://host:port/--/stripe-return?...`, or the bare path Expo Router hands over.
 */
export function isStripeReturnLink(incoming: string): boolean {
  let rest = incoming.trim();
  const scheme = rest.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    // `resneo://stripe-return` puts the route where a host would be; any other scheme has a host first.
    if (scheme[0].toLowerCase() !== 'resneo://') {
      const slash = rest.indexOf('/');
      rest = slash === -1 ? '' : rest.slice(slash);
    }
  }
  rest = rest.replace(/^\/--(?=\/)/, '');
  const path = (rest.split(/[?#]/)[0] ?? '').replace(/^\/+|\/+$/g, '');
  return path === STRIPE_RETURN_ROUTE;
}
