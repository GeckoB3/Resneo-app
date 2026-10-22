import { webUrlToAppRoute } from '@/lib/navigation/web-url-to-app-route';
import { isStripeReturnLink } from '@/lib/payments/stripe-return';

/**
 * Rewrite an incoming deep link before Expo Router tries to resolve it.
 *
 * This exists for one reason: the web portal's URLs are not the app's routes.
 * A universal link to `https://www.resneo.com/account/bookings/abc` would
 * otherwise arrive as a path with no matching screen and open the app on a
 * not-found, which is worse than letting the browser handle it.
 *
 * **Runs outside the app**, before any provider exists, so there is no auth
 * state to consult and nothing to await. That is fine: the translation is
 * structural, and whether the customer may SEE the booking is the root router's
 * job. A signed-out tap lands on the sign-in screen, which is what it should do.
 *
 * The mapping itself lives in `lib/navigation/web-url-to-app-route.ts` so it can
 * be tested as a pure function. This file is the wiring.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Stripe handing back to the app (`lib/payments/stripe-return.ts`): the auth session that
    // opened Stripe takes it, and on Android it also arrives here, where no screen matches it.
    // An empty path navigates nowhere, so the owner stays on the screen they connected from.
    if (isStripeReturnLink(path)) return '';
    return webUrlToAppRoute(path);
  } catch {
    /*
      Never throw from here. This runs during launch, before the app exists, so
      an exception takes the launch with it. Handing the path back unchanged
      means the worst case is Expo Router's own not-found rather than a dead
      start.
    */
    return path;
  }
}
