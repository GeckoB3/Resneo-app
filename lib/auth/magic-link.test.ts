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
 * ResNeo's own route sends a branded email carrying a numeric code, which the
 * app can verify directly against Supabase with no redirect in the path at all.
 */
import {
  isAccountEnumerationError,
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

describe('the code the email contains, whose LENGTH IS NOT FIXED', () => {
  /*
    Supabase's email OTP length is a per-project dashboard setting. The web
    repo's `supabase/config.toml` says `otp_length = 6`, but that configures a
    local `supabase start` and says nothing about a hosted project: staging
    sends EIGHT. Production is a different project again.

    The first version of this hardcoded six, and the damage was not a rejected
    code. `normaliseSignInCode` capped at six, so an eight-digit code was
    truncated AS IT WAS TYPED and the field silently refused to hold the code
    the email had just given somebody.
  */
  it('accepts the EIGHT digits staging actually sends', () => {
    expect(isLikelySignInCode('12345678')).toBe(true);
  });

  it('keeps all eight rather than truncating them away', () => {
    // The bug, pinned. Slicing to six here is what made the field unusable.
    expect(normaliseSignInCode('12345678')).toBe('12345678');
  });

  it('still accepts six, because another project may well send six', () => {
    expect(isLikelySignInCode('123456')).toBe(true);
    expect(normaliseSignInCode('123456')).toBe('123456');
  });

  it('accepts ten, the longest Supabase offers', () => {
    expect(isLikelySignInCode('1234567890')).toBe(true);
    expect(normaliseSignInCode('1234567890')).toBe('1234567890');
  });

  it('rejects what is too short to be any project’s code', () => {
    // Six is Supabase's floor, so fewer than six cannot be right anywhere. The
    // check exists to disable a button, not to second-guess the server.
    for (const bad of ['', '1', '12345', 'abcdef']) {
      expect(isLikelySignInCode(bad)).toBe(false);
    }
  });

  it('strips whatever came with a paste', () => {
    // People paste "123 456", and mail clients paste whole sentences.
    expect(normaliseSignInCode('1234 5678')).toBe('12345678');
    expect(normaliseSignInCode('Enter this code instead: 12345678')).toBe('12345678');
  });

  it('has a generous ceiling rather than a guessed one', () => {
    // A cap stops a pasted paragraph becoming the "code", but it must sit well
    // clear of any length a project might be configured for.
    expect(normaliseSignInCode('1'.repeat(40)).length).toBeGreaterThanOrEqual(10);
  });
});

describe('not telling anyone whether an address has an account', () => {
  /*
    Since the app stopped creating accounts from the sign-in box, Supabase
    refuses an address it does not know. Passing that refusal to the screen
    would turn sign-in into an account checker: type an address, learn whether
    that person uses ResNeo. The web takes the same care, returning an identical
    `{ fallback: true }` whether generation failed or the user does not exist.
  */
  it('spots the refusal by its code', () => {
    expect(isAccountEnumerationError({ code: 'otp_disabled', status: 422 })).toBe(true);
    expect(isAccountEnumerationError({ code: 'user_not_found' })).toBe(true);
  });

  it('spots it by wording too, since the exact code is the server’s to choose', () => {
    // The code comes from GoTrue and is not enumerable in @supabase/auth-js, so
    // a single guessed string would fail OPEN and leak what it exists to hide.
    expect(isAccountEnumerationError({ message: 'Signups not allowed for otp' })).toBe(true);
    expect(isAccountEnumerationError({ message: 'User not found' })).toBe(true);
  });

  it('spots a bare 422, which this call has no other reason to see', () => {
    expect(isAccountEnumerationError({ status: 422 })).toBe(true);
  });

  it('does NOT swallow a rate limit, which the person needs to be told', () => {
    // Over-matching costs a vaguer message; swallowing a 429 costs somebody the
    // one piece of information that explains the wait.
    expect(isAccountEnumerationError({ status: 429, message: 'Too many requests' })).toBe(false);
  });

  it('does NOT swallow a server or network failure', () => {
    expect(isAccountEnumerationError({ status: 500, message: 'Internal error' })).toBe(false);
    expect(isAccountEnumerationError({ message: 'Network request failed' })).toBe(false);
  });

  it('survives rubbish rather than throwing before sign-in can report anything', () => {
    for (const junk of [null, undefined, 'nope', 7, []]) {
      expect(isAccountEnumerationError(junk)).toBe(false);
    }
  });
});
