/**
 * Translate a resneo.com URL into the route this app can actually serve.
 *
 * The two surfaces name the same things differently. The web portal lives under
 * `/account`, because it shares a domain with the marketing site and the venue
 * dashboard; the app has the customer side to itself and calls them
 * `/bookings`, `/booking/[id]`, `/passes`, `/profile`.
 *
 * That mismatch is what blocked the association files. A universal link to
 * `https://www.resneo.com/account/bookings/abc` arrives as the path
 * `/account/bookings/abc`, which Expo Router cannot resolve, so the tap would
 * open the app on a not-found. That is WORSE than opening the browser, which
 * would at least have shown the booking.
 *
 * Two ways to fix it, and this is the second. Renaming every app route to match
 * the web would make the app's own navigation read like the website's URL
 * structure for the sake of links that arrive from outside. Translating at the
 * boundary keeps each surface named for itself and puts the mapping in one
 * readable place.
 *
 * **Pure, and deliberately so.** `+native-intent` runs OUTSIDE the app context:
 * no hooks, no auth state, no query cache. Everything here is a string
 * transformation, which is also what makes it testable without a device.
 */

/** Anything not recognised passes through untouched. */
export function webUrlToAppRoute(incoming: string): string {
  const path = pathOf(incoming);

  // The customer portal, in the order that matters: the most specific first, or
  // `/account/bookings/{id}` would be swallowed by the `/account/bookings` rule
  // and drop the booking.
  const bookingDetail = path.match(/^\/account\/bookings\/([^/?#]+)/);
  if (bookingDetail) return `/booking/${bookingDetail[1]}`;

  if (path === '/account/bookings') return '/bookings';
  if (path === '/account/passes' || path.startsWith('/account/passes/')) return '/passes';
  if (path === '/account/profile') return '/profile';
  if (path === '/account' || path === '/account/') return '/';

  /*
    Everything else is returned as it came, including the auth paths.
    `resneo://callback` carries magic-link and password-reset sign-in and has
    worked since long before any of this; rewriting a path this function does
    not understand would be how that breaks.
  */
  return path;
}

/**
 * The path part of whatever arrived.
 *
 * Expo's own docs warn that the incoming value is "not guaranteed to be a valid
 * URL", so this handles three shapes: a full https URL, a `resneo://` URL, and
 * a bare path. A parse failure returns the input rather than throwing, because
 * throwing here happens before the app exists and takes the launch with it.
 */
function pathOf(incoming: string): string {
  if (incoming.startsWith('/')) return incoming;
  try {
    const url = new URL(incoming);
    // A custom-scheme URL puts the first segment in `host`, so `resneo://callback`
    // parses with host 'callback' and an empty pathname. Rejoining them is what
    // keeps those links intact.
    if (url.protocol === 'resneo:') {
      const host = url.hostname ? `/${url.hostname}` : '';
      return `${host}${url.pathname}` || '/';
    }
    return url.pathname || '/';
  } catch {
    return incoming;
  }
}
