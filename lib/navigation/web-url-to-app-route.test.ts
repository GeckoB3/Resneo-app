/**
 * C6: turning a resneo.com URL into a route this app can serve.
 *
 * This is the piece that unblocked the association files. Without it a
 * universal link to the web portal arrives as a path Expo Router cannot
 * resolve, and the tap opens the app on a not-found, which is worse than
 * opening the browser: the browser would have shown the booking.
 *
 * Tested as a pure function because `+native-intent` runs outside the app, so
 * there is nothing to render and nothing to mock.
 */
import { webUrlToAppRoute } from '@/lib/navigation/web-url-to-app-route';

describe('web portal URLs become app routes', () => {
  it.each([
    ['https://www.resneo.com/account/bookings', '/bookings'],
    ['https://www.resneo.com/account/passes', '/passes'],
    ['https://www.resneo.com/account/profile', '/profile'],
    ['https://www.resneo.com/account', '/'],
  ])('%s -> %s', async (incoming, expected) => {
    expect(webUrlToAppRoute(incoming)).toBe(expected);
  });

  it('keeps the booking id when translating a booking link', async () => {
    /*
      The one that carries information. An ordering mistake here, matching
      `/account/bookings` before the id rule, silently drops the id and lands
      everybody on the list: the link still "works", so nothing looks broken,
      and the customer just never sees the booking they tapped.
    */
    expect(webUrlToAppRoute('https://www.resneo.com/account/bookings/abc-123')).toBe(
      '/booking/abc-123',
    );
  });

  it('ignores a query string and fragment on a booking link', async () => {
    expect(webUrlToAppRoute('https://www.resneo.com/account/bookings/abc?utm=email#top')).toBe(
      '/booking/abc',
    );
  });

  it('sends a passes tab link to the passes screen', async () => {
    // The web deep-links tabs as /account/passes/credits; the app has one
    // screen with a segmented control, so the tab is dropped rather than
    // resolving to nothing.
    expect(webUrlToAppRoute('https://www.resneo.com/account/passes/credits')).toBe('/passes');
  });
});

describe('what must pass through untouched', () => {
  it('leaves the auth callback alone, CREDENTIAL AND ALL', async () => {
    /*
      This test used to assert `/callback`, with a comment about protecting
      sign-in, while asserting the exact bug that broke it.

      `resneo://callback?code=…` carries the magic-link credential in its query.
      Returning the bare path drops it, the callback screen finds nothing to
      exchange, and every magic-link sign-in fails with "this link is invalid or
      has expired". That shipped in C6. A test naming the risk in prose and
      pinning the broken value in code is worse than no test: it reads as a
      guard and works as a lock.
    */
    expect(webUrlToAppRoute('resneo://callback?code=abc')).toBe('/callback?code=abc');
  });

  it('keeps the implicit-flow tokens, which arrive in the FRAGMENT', async () => {
    // A different half of the same mistake. Not every link uses PKCE, and
    // recovery links in particular still arrive with a fragment.
    expect(webUrlToAppRoute('resneo://callback#access_token=xyz&refresh_token=abc')).toBe(
      '/callback#access_token=xyz&refresh_token=abc',
    );
  });

  it('keeps the query on a bare path too', async () => {
    // The same link can arrive already reduced to a path. Handling only the
    // URL shape would fix half the launches.
    expect(webUrlToAppRoute('/callback?code=abc')).toBe('/callback?code=abc');
  });

  it('keeps an error the link is reporting', async () => {
    // An expired link says so in the query. Stripping that turns a precise
    // "this link has expired" into a blank "sign-in failed".
    expect(webUrlToAppRoute('resneo://callback?error=access_denied&error_code=otp_expired')).toBe(
      '/callback?error=access_denied&error_code=otp_expired',
    );
  });

  it('leaves an app path the app already owns', async () => {
    expect(webUrlToAppRoute('/booking/abc')).toBe('/booking/abc');
    expect(webUrlToAppRoute('/bookings')).toBe('/bookings');
  });

  it('leaves a venue-side path alone', async () => {
    // The staff app owns these. Translating them would break the venue side to
    // fix the customer side.
    expect(webUrlToAppRoute('https://www.resneo.com/dashboard')).toBe('/dashboard');
  });

  it('leaves an unrecognised web path as its path', async () => {
    expect(webUrlToAppRoute('https://www.resneo.com/help/getting-started')).toBe(
      '/help/getting-started',
    );
  });
});

describe('it never throws, because it runs before the app exists', () => {
  it.each(['', 'not a url at all', 'https://', '://///', 'resneo://'])(
    'survives %p',
    async (input) => {
      expect(() => webUrlToAppRoute(input)).not.toThrow();
    },
  );

  it('does not confuse a lookalike path for the portal', async () => {
    // `/accounts` is not `/account`, and a prefix match would have claimed it.
    expect(webUrlToAppRoute('https://www.resneo.com/accounts/bookings')).toBe('/accounts/bookings');
  });
});

describe('paths Android claims but the app cannot serve', () => {
  /*
    Apple's AASA excludes them, so on iOS they never arrive. Android has no
    exclusion: an intent filter claims a prefix, so `/account/bookingsXYZ`
    matches `pathPrefix: '/account/bookings'` and reaches the app. Landing on a
    not-found for a link the customer was invited to tap is the failure this
    avoids.
  */
  it.each([
    'https://www.resneo.com/account/bookingsXYZ',
    'https://www.resneo.com/account/something-the-web-added-later',
    'https://www.resneo.com/account/export',
  ])('%s lands on the hub, not a not-found', async (url) => {
    expect(webUrlToAppRoute(url)).toBe('/');
  });

  it('still does not claim a path merely starting with the same letters', async () => {
    // `/accounts` is a different path, and swallowing it would be the app
    // taking over a page it was never given.
    expect(webUrlToAppRoute('https://www.resneo.com/accounts/bookings')).toBe('/accounts/bookings');
  });
});
