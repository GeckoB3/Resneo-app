/**
 * Which sign-in email gets sent, and what happens when it cannot be.
 *
 * The app used to call `supabase.auth.signInWithOtp` directly, which sends
 * Supabase's default template from noreply@mail.app.supabase.io. Its link goes
 * to GoTrue's verify endpoint and comes back to a `resneo://` redirect, which
 * depends on the scheme being allowlisted AND on the mail client and browser
 * being willing to hand a custom scheme off from an HTTP 302. When that fails
 * it fails silently, landing on the website.
 *
 * ResNeo's own route sends a branded email carrying a six-digit code, which the
 * app can verify directly against Supabase with no redirect in the path at all.
 */
import {
  isLikelySignInCode,
  normaliseSignInCode,
  sendBrandedMagicLink,
} from '@/lib/auth/magic-link';

jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://example.test' }));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function respond(status: number, body: unknown) {
  mockFetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => mockFetch.mockReset());

describe('asking ResNeo to send the email', () => {
  it('reports it sent when the route says ok', async () => {
    respond(200, { ok: true });
    expect(await sendBrandedMagicLink('a@b.com')).toEqual({ status: 'sent' });
  });

  it('posts the address to the route the web signs in through', async () => {
    respond(200, { ok: true });
    await sendBrandedMagicLink('A@B.com');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/auth/send-magic-link');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'A@B.com' });
  });

  it('sends NO Authorization header, because nobody is signed in yet', async () => {
    // This is how somebody with no session gets one. Requiring a token would
    // make it unreachable by the only people who need it.
    respond(200, { ok: true });
    await sendBrandedMagicLink('a@b.com');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('when the branded email cannot be sent', () => {
  it('treats `{ fallback: true }` as a fallback, NOT as success', async () => {
    /*
      It arrives as a 200. Reading it as sent would show "check your email" for
      a message the server had just declined to send, and the person would sit
      waiting for mail that was never coming.
    */
    respond(200, { fallback: true });
    expect(await sendBrandedMagicLink('a@b.com')).toEqual({ status: 'fallback' });
  });

  it('falls back rather than failing when the route errors', async () => {
    // A customer does not care which of two mail systems carries the message.
    // Refusing to sign them in because our nicer email broke would be choosing
    // branding over access.
    respond(500, { error: 'Internal server error' });
    expect(await sendBrandedMagicLink('a@b.com')).toEqual({ status: 'fallback' });
  });

  it('falls back when the network is gone', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    expect(await sendBrandedMagicLink('a@b.com')).toEqual({ status: 'fallback' });
  });
});

describe('a rate limit is an answer, not a failure', () => {
  it('surfaces the server’s own 429 wording instead of falling back', async () => {
    /*
      The route limits per ADDRESS as well as per IP, specifically to protect
      somebody whose inbox is being bombed by a third party. Falling back here
      would send, through Supabase, the very email the server just refused.
    */
    respond(429, { error: 'Too many sign-in link requests. Try again shortly.' });
    expect(await sendBrandedMagicLink('a@b.com')).toEqual({
      status: 'error',
      message: 'Too many sign-in link requests. Try again shortly.',
    });
  });

  it('still says something useful when the 429 carries no message', async () => {
    respond(429, {});
    const outcome = await sendBrandedMagicLink('a@b.com');
    expect(outcome.status).toBe('error');
  });
});

describe('the code the email contains', () => {
  it('accepts exactly six digits', () => {
    expect(isLikelySignInCode('123456')).toBe(true);
    expect(isLikelySignInCode(' 123456 ')).toBe(true);
  });

  it('rejects anything shorter, longer or not a number', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56']) {
      expect(isLikelySignInCode(bad)).toBe(false);
    }
  });

  it('strips whatever came with a paste', () => {
    // People paste "123 456", and mail clients paste whole sentences.
    expect(normaliseSignInCode('123 456')).toBe('123456');
    expect(normaliseSignInCode('code: 123456 expires soon')).toBe('123456');
  });

  it('never yields more than six digits', () => {
    expect(normaliseSignInCode('1234567890')).toBe('123456');
  });
});
