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
jest.mock('@/lib/auth/magic-link', () => ({
  sendBrandedMagicLink: (...a: unknown[]) => mockSendBranded(...a),
}));
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
