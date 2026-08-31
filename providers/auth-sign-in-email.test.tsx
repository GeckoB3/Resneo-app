/**
 * Which email a sign-in attempt sends, and what it must never do.
 *
 * Two behaviours here are worth real tests. The app must not create an account
 * from the sign-in box, and it must not abandon somebody when ResNeo's own mail
 * fails. Neither had any coverage, which is how a `shouldCreateUser` default
 * sat there creating accounts for typos.
 */
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSendBranded = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  }),
  isSupabaseConfigured: () => true,
}));
jest.mock('@/lib/auth/magic-link', () => {
  const actual = jest.requireActual('@/lib/auth/magic-link');
  return { ...actual, sendBrandedMagicLink: (...a: unknown[]) => mockSendBranded(...a) };
});
jest.mock('@/lib/push/registerDevice', () => ({
  registerDevice: jest.fn(),
  unregisterDevice: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: new Proxy({}, { get: (_t, k) => String(k) }),
  track: jest.fn(),
  identify: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('@/lib/observability', () => ({ setObservabilityUser: jest.fn() }));
// `Linking.createURL` needs the expo-constants manifest, which jest-expo does
// not provide; the real value is a deep link nothing here follows.
jest.mock('@/lib/auth/redirect', () => ({
  getAuthCallbackRedirectUrl: () => 'resneo://callback',
}));
/*
  NetInfo reaches for a native module that jest-expo does not provide, and its
  reachability probe throws asynchronously partway through these tests. Nothing
  under test depends on connectivity.
*/
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
  configure: () => {},
}));

import { AuthProvider, useAuth } from '@/providers/AuthProvider';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

async function auth() {
  const { result } = await renderHook(() => useAuth(), { wrapper });
  return result;
}

beforeEach(() => {
  mockSignInWithOtp.mockReset().mockResolvedValue({ error: null });
  mockVerifyOtp.mockReset().mockResolvedValue({ error: null });
  mockSendBranded.mockReset().mockResolvedValue({ status: 'sent' });
});

describe('the branded email leads', () => {
  it('asks ResNeo first and does NOT fall through when it sends', async () => {
    const result = await auth();
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithEmail('a@b.com');
    });
    expect(mockSendBranded).toHaveBeenCalledWith('a@b.com');
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    // `codeSent` is what tells the screen to offer the code box.
    expect(outcome).toEqual({ error: null, codeSent: true });
  });

  it('does NOT send a second email through Supabase after a rate limit', async () => {
    /*
      The route limits per address to protect somebody whose inbox is being
      bombed. Falling through would send, via Supabase, the very message the
      server just refused, defeating the limit entirely.
    */
    mockSendBranded.mockResolvedValue({ status: 'error', message: 'Too many. Try again shortly.' });
    const result = await auth();
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithEmail('a@b.com');
    });
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
    expect(outcome).toEqual({ error: 'Too many. Try again shortly.', codeSent: false });
  });
});

describe('the fallback, which must not lock anyone out', () => {
  it('uses Supabase when ResNeo cannot send', async () => {
    // A customer does not care which mail system carries the message.
    mockSendBranded.mockResolvedValue({ status: 'fallback' });
    const result = await auth();
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithEmail('a@b.com');
    });
    expect(mockSignInWithOtp).toHaveBeenCalled();
    // No code in that email, so the screen must not ask for one.
    expect(outcome).toEqual({ error: null, codeSent: false });
  });

  it('NEVER creates an account from the sign-in box', async () => {
    /*
      The one that had no test and needed one most. supabase-js defaults
      `shouldCreateUser` to true, so a mistyped address produced a NEW empty
      account and a working link for it: somebody trying to get back into the
      account they already have would be signed in to an empty one and conclude
      their bookings were gone.

      It also undid the branded route's own refusal, since `generateLink`
      declines an address it does not know. In ResNeo an account comes from
      booking or being invited, never from typing into this box.
    */
    mockSendBranded.mockResolvedValue({ status: 'fallback' });
    const result = await auth();
    await act(async () => {
      await result.current.signInWithEmail('typo@b.com');
    });
    expect(mockSignInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  });
});

describe('finishing with the code', () => {
  it('verifies it as an email OTP, normalised', async () => {
    const result = await auth();
    await act(async () => {
      await result.current.verifySignInCode('  A@B.com ', ' 12345678 ');
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      token: '12345678',
      type: 'email',
    });
  });

  it('passes the server’s refusal back rather than inventing one', async () => {
    // "Token has expired or is invalid" tells somebody to request another. A
    // generic failure does not.
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    const result = await auth();
    let outcome;
    await act(async () => {
      outcome = await result.current.verifySignInCode('a@b.com', '12345678');
    });
    expect(outcome).toEqual({ error: 'Token has expired or is invalid' });
  });
});

describe('password reset is gone from this app', () => {
  it('exposes no way to send a recovery email', async () => {
    /*
      Deliberate. `resetPasswordForEmail` redirected to `resneo://callback`, the
      one transport that silently fails by landing on the website, and its email
      came from Supabase rather than ResNeo because Supabase is what sends it.
      The code flow reaches the same set-a-password screen over a transport that
      works.

      `app/(auth)/callback.tsx` still HONOURS a recovery link. Not generating
      them is different from refusing one.
    */
    const result = await auth();
    expect(
      (result.current as unknown as Record<string, unknown>).requestPasswordReset,
    ).toBeUndefined();
  });
});

describe('an unknown address is answered like any other', () => {
  /*
    The app no longer creates an account from this box, so Supabase refuses an
    address it does not know. Reporting that refusal would turn sign-in into an
    account checker: type an address, learn whether that person uses ResNeo.
  */
  it('reports success, revealing nothing, when the address has no account', async () => {
    mockSendBranded.mockResolvedValue({ status: 'fallback' });
    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' },
    });
    const result = await auth();
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithEmail('nobody@nowhere.com');
    });
    expect(outcome).toEqual({ error: null, codeSent: false });
  });

  it('is INDISTINGUISHABLE from a real send, which is the whole point', async () => {
    // Any difference in what comes back is the leak, however small.
    mockSendBranded.mockResolvedValue({ status: 'fallback' });
    const result = await auth();

    mockSignInWithOtp.mockResolvedValue({ error: null });
    let real;
    await act(async () => {
      real = await result.current.signInWithEmail('real@person.com');
    });

    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' },
    });
    let unknown;
    await act(async () => {
      unknown = await result.current.signInWithEmail('nobody@nowhere.com');
    });

    expect(unknown).toEqual(real);
  });

  it('still reports a failure that is NOT about the address existing', async () => {
    // Silence is for enumeration only. Swallowing a real outage would leave
    // somebody waiting for mail that never comes, with nothing to act on.
    mockSendBranded.mockResolvedValue({ status: 'fallback' });
    mockSignInWithOtp.mockResolvedValue({
      error: { message: 'Email provider is disabled', status: 500 },
    });
    const result = await auth();
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithEmail('a@b.com');
    });
    expect(outcome).toEqual({ error: 'Email provider is disabled', codeSent: false });
  });
});
