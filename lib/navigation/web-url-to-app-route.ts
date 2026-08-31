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

/** Anything not recognised passes through untouched, QUERY AND FRAGMENT INCLUDED. */
export function webUrlToAppRoute(incoming: string): string {
  const { path, rest } = splitIncoming(incoming);

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
    Anything else under `/account` lands on the hub rather than passing through
    to a not-found.

    Apple lets the AASA EXCLUDE the paths the app cannot serve, so on iOS these
    never arrive. Android has no equivalent: an intent filter claims a prefix,
    and `pathPrefix: '/account/bookings'` also matches `/account/bookingsXYZ`.
    So on Android a claimed-but-unroutable path is reachable, and the honest
    landing is the customer's own hub rather than an error screen for a link
    they were invited to tap.
  */
  if (path === '/account' || path.startsWith('/account/')) return '/';

  /*
    Everything else is returned AS IT CAME, query and fragment included.

    That last part is not a detail. `resneo://callback?code=…` carries the
    magic-link credential in its query, and the implicit flow carries tokens in
    the fragment. Returning the bare path silently strips them, the callback
    screen finds nothing to exchange, and every magic-link sign-in fails with
    "this link is invalid or has expired". It shipped that way in C6 and broke
    sign-in for anybody using a link instead of a password.

    Mapped paths above deliberately DO drop the query, because there it is
    campaign tracking on a web URL and the app has its own destination.
  */
  return `${path}${rest}`;
}

/**
 * Split whatever arrived into the path and everything after it.
 *
 * `rest` is the query and fragment, kept verbatim so a pass-through can put
 * them back. They are separated rather than ignored because the path is what
 * the routing rules match on, and the credentials live in what follows.
 *
 * Expo's own docs warn the incoming value is "not guaranteed to be a valid
 * URL", so this handles three shapes: a full https URL, a `resneo://` URL, and
 * a bare path. A parse failure returns the input unchanged rather than
 * throwing, because throwing here happens before the app exists and takes the
 * launch with it.
 */
function splitIncoming(incoming: string): { path: string; rest: string } {
  if (incoming.startsWith('/')) {
    const cut = incoming.search(/[?#]/);
    return cut === -1
      ? { path: incoming, rest: '' }
      : { path: incoming.slice(0, cut), rest: incoming.slice(cut) };
  }
  try {
    const url = new URL(incoming);
    const rest = `${url.search}${url.hash}`;
    // A custom-scheme URL puts the first segment in `host`, so `resneo://callback`
    // parses with host 'callback' and an empty pathname. Rejoining them is what
    // keeps those links intact.
    if (url.protocol === 'resneo:') {
      const host = url.hostname ? `/${url.hostname}` : '';
      return { path: `${host}${url.pathname}` || '/', rest };
    }
    return { path: url.pathname || '/', rest };
  } catch {
    return { path: incoming, rest: '' };
  }
}
