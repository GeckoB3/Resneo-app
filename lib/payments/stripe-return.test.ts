/**
 * Stripe handing back to the app through the web's `/stripe-return` (owner, 2026-10-22): the
 * status the page puts on the link, and the link itself, which `+native-intent` drops so Expo
 * Router never opens a not-found for it on Android.
 */
import { redirectSystemPath } from '@/app/+native-intent';

import { isStripeReturnLink, stripeReturnStatus } from './stripe-return';

describe('stripeReturnStatus', () => {
  it('reads expired from the link, and anything else as done', () => {
    expect(stripeReturnStatus('resneo://stripe-return?status=expired')).toBe('expired');
    expect(stripeReturnStatus('exp://192.168.1.20:8081/--/stripe-return?status=expired&site=x')).toBe('expired');
    expect(stripeReturnStatus('resneo://stripe-return?status=done')).toBe('done');
    expect(stripeReturnStatus('resneo://stripe-return')).toBe('done');
  });
});

describe('isStripeReturnLink', () => {
  it.each([
    'resneo://stripe-return?status=done',
    'resneo://stripe-return',
    'exp://192.168.1.20:8081/--/stripe-return?status=expired',
    '/stripe-return?status=done',
    'stripe-return',
  ])('recognises %s', (incoming) => {
    expect(isStripeReturnLink(incoming)).toBe(true);
  });

  it.each([
    'resneo://callback?code=abc',
    'resneo://stripe-returned',
    '/account/bookings/abc',
    'https://www.resneo.com/account',
    'exp://192.168.1.20:8081/--/callback',
  ])('leaves %s alone', (incoming) => {
    expect(isStripeReturnLink(incoming)).toBe(false);
  });
});

describe('redirectSystemPath', () => {
  it('navigates nowhere for the Stripe return, so the owner stays where they connected from', () => {
    expect(redirectSystemPath({ path: 'resneo://stripe-return?status=done', initial: false })).toBe('');
    expect(redirectSystemPath({ path: '/stripe-return?status=expired', initial: true })).toBe('');
  });

  it('still hands every other link to the web URL mapping', () => {
    expect(redirectSystemPath({ path: 'resneo://callback?code=abc', initial: true })).toBe('/callback?code=abc');
    expect(redirectSystemPath({ path: '/account/bookings', initial: false })).toBe('/bookings');
  });
});
