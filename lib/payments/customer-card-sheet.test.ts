/**
 * The one file that touches Stripe's native SDK, tested as far as it can be.
 *
 * The SDK itself is mocked, so this proves nothing about whether the native
 * module builds or behaves. What it does pin is the wiring around the call,
 * which is where the mistakes that reach a customer live: opening a sheet
 * against the wrong Stripe account, or opening one at all in a build that has
 * no publishable key.
 */
const mockInitStripe = jest.fn().mockResolvedValue(undefined);
const mockInitPaymentSheet = jest.fn().mockResolvedValue({});
const mockPresentPaymentSheet = jest.fn().mockResolvedValue({});
const mockKey = jest.fn(() => 'pk_test_123');

jest.mock('@stripe/stripe-react-native', () => ({
  initStripe: (...a: unknown[]) => mockInitStripe(...a),
  initPaymentSheet: (...a: unknown[]) => mockInitPaymentSheet(...a),
  presentPaymentSheet: (...a: unknown[]) => mockPresentPaymentSheet(...a),
}));
jest.mock('@/lib/env', () => ({ getStripePublishableKey: () => mockKey() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { presentCardSheet } = require('./customer-card-sheet') as typeof import('./customer-card-sheet');

const TICKET = { client_secret: 'seti_1_secret', stripe_account_id: 'acct_venue1' };

const show = (over: Partial<Parameters<typeof presentCardSheet>[0]> = {}) =>
  presentCardSheet({ ticket: TICKET, venueName: 'The Studio', isSetupIntent: true, ...over });

beforeEach(() => {
  mockInitStripe.mockClear().mockResolvedValue(undefined);
  mockInitPaymentSheet.mockClear().mockResolvedValue({});
  mockPresentPaymentSheet.mockClear().mockResolvedValue({});
  mockKey.mockReturnValue('pk_test_123');
});

describe('which Stripe account the sheet talks to', () => {
  it('initialises against the VENUE’s connected account, not the platform', async () => {
    /*
      The intent exists only inside the venue's own account. A sheet opened
      against the platform account finds nothing, and since a customer can hold
      bookings at several venues there is no single account to configure once at
      the root.
    */
    await show();
    expect(mockInitStripe.mock.calls[0][0]).toMatchObject({
      publishableKey: 'pk_test_123',
      stripeAccountId: 'acct_venue1',
    });
  });

  it('initialises BEFORE building the sheet', async () => {
    // The other order configures a sheet on an account the SDK has not been
    // pointed at yet.
    await show();
    expect(mockInitStripe.mock.invocationCallOrder[0]).toBeLessThan(
      mockInitPaymentSheet.mock.invocationCallOrder[0],
    );
  });

  it('sets the url scheme 3D Secure returns to', async () => {
    // Registered in app.json. Without it a customer completes their bank's
    // check and lands nowhere.
    expect(mockInitStripe).not.toHaveBeenCalled();
    await show();
    expect(mockInitStripe.mock.calls[0][0].urlScheme).toBe('resneo');
  });
});

describe('a build with no publishable key', () => {
  it('refuses before opening anything, and says so', async () => {
    /*
      Not hypothetical: the production EAS profile carries no
      EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY today. Without this guard the SDK is
      called uninitialised and fails with something a customer cannot act on.
    */
    mockKey.mockReturnValue(null as unknown as string);
    const result = await show();
    expect(result.status).toBe('failed');
    expect(mockInitStripe).not.toHaveBeenCalled();
    expect(mockInitPaymentSheet).not.toHaveBeenCalled();
  });
});

describe('which secret the sheet is built with', () => {
  it('uses the setup intent secret when saving a card', async () => {
    await show({ isSetupIntent: true });
    expect(mockInitPaymentSheet.mock.calls[0][0]).toMatchObject({
      setupIntentClientSecret: 'seti_1_secret',
    });
  });

  it('uses the payment intent secret when paying now', async () => {
    // The secret and the mode must agree, or the sheet refuses in a way the
    // customer cannot act on.
    await show({ isSetupIntent: false });
    expect(mockInitPaymentSheet.mock.calls[0][0]).toMatchObject({
      paymentIntentClientSecret: 'seti_1_secret',
    });
  });

  it('names the venue on the sheet', async () => {
    await show();
    expect(mockInitPaymentSheet.mock.calls[0][0].merchantDisplayName).toBe('The Studio');
  });
});

describe('outcomes', () => {
  it('treats a dismissal as cancelled, not as a failure', async () => {
    // Somebody who changed their mind has not hit a problem and should not be
    // shown a red message saying they have.
    mockPresentPaymentSheet.mockResolvedValue({ error: { code: 'Canceled', message: 'x' } });
    expect((await show()).status).toBe('cancelled');
  });

  it('reports a real Stripe error with its message', async () => {
    mockPresentPaymentSheet.mockResolvedValue({
      error: { code: 'Failed', message: 'Your card was declined.' },
    });
    expect(await show()).toEqual({ status: 'failed', message: 'Your card was declined.' });
  });

  it('reports an init failure without presenting a sheet', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: { message: 'bad secret' } });
    expect((await show()).status).toBe('failed');
    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  });

  it('survives the native module throwing', async () => {
    mockInitStripe.mockRejectedValue(new Error('native crash'));
    expect((await show()).status).toBe('failed');
  });
});
