/**
 * Stripe onboarding from the app (owner, 2026-10-22): the link asks Stripe to come back through the
 * web's `/stripe-return` to this app's link, and Stripe's pages open in an auth session that closes
 * when it does. jest hoists mock factories above imports, so closed-over names start `mock`.
 */
const mockOpenAuthSession = jest.fn();
const mockOpenURL = jest.fn();

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args) }));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `resneo://${path}`,
  openURL: (...args: unknown[]) => mockOpenURL(...args),
}));

import { openStripeOnboarding, STRIPE_ONBOARDING_COPY, stripeConnectReturnBody } from './stripe-onboarding';

const STRIPE = 'https://connect.stripe.com/setup/e/acct_1/abc';

beforeEach(() => {
  mockOpenAuthSession.mockReset();
  mockOpenURL.mockReset();
});

describe('stripeConnectReturnBody', () => {
  it("names /stripe-return for both of Stripe's links, with the app's link to go on to", () => {
    expect(stripeConnectReturnBody()).toEqual({
      return_path: '/stripe-return?status=done&app=resneo%3A%2F%2Fstripe-return',
      refresh_path: '/stripe-return?status=expired&app=resneo%3A%2F%2Fstripe-return',
    });
  });

  it("carries Expo Go's own link in a device test", () => {
    const body = stripeConnectReturnBody('exp://192.168.1.20:8081/--/stripe-return');
    expect(body.return_path).toBe('/stripe-return?status=done&app=exp%3A%2F%2F192.168.1.20%3A8081%2F--%2Fstripe-return');
  });
});

describe('openStripeOnboarding', () => {
  it('opens Stripe in an auth session waiting for the app link, without the iOS sign-in prompt', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'resneo://stripe-return?status=done' });
    await expect(openStripeOnboarding(STRIPE)).resolves.toBe('returned');
    expect(mockOpenAuthSession).toHaveBeenCalledWith(STRIPE, 'resneo://stripe-return', {
      preferEphemeralSession: true,
      createTask: false,
    });
  });

  it('says when the link expired', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'resneo://stripe-return?status=expired' });
    await expect(openStripeOnboarding(STRIPE)).resolves.toBe('expired');
  });

  it('counts a closed window as closed', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    await expect(openStripeOnboarding(STRIPE)).resolves.toBe('closed');
    mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' });
    await expect(openStripeOnboarding(STRIPE)).resolves.toBe('closed');
  });

  it("falls back to the phone's browser, and fails only when nothing opens", async () => {
    mockOpenAuthSession.mockRejectedValue(new Error('unavailable'));
    mockOpenURL.mockResolvedValue(true);
    await expect(openStripeOnboarding(STRIPE)).resolves.toBe('closed');
    expect(mockOpenURL).toHaveBeenCalledWith(STRIPE);

    mockOpenURL.mockRejectedValue(new Error('no browser'));
    await expect(openStripeOnboarding(STRIPE)).resolves.toBe('failed');
  });

  it('has no em-dashes in its words', () => {
    expect(JSON.stringify(STRIPE_ONBOARDING_COPY)).not.toContain(String.fromCharCode(0x2014));
  });
});
