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
  it('leaves the auth callback alone', async () => {
    /*
      `resneo://callback` carries magic-link and password-reset sign-in and has
      worked since long before any of this. Rewriting a path this function does
      not understand is exactly how that would break, so the default is to
      return what arrived.
    */
    expect(webUrlToAppRoute('resneo://callback?code=abc')).toBe('/callback');
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
