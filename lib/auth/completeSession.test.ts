/**
 * Domain 17 (Auth Low): the auth-callback exchange must return a *discriminated*
 * failure reason (otp_expired | exchange_failed | generic) so `callback.tsx` can
 * render reason-specific copy + a "Back to sign in" action (mirroring the web
 * AuthCallbackErrorBanner), and must surface the resolved OTP type on success so
 * recovery/invite links route to the set-password screen.
 *
 * Pure-logic suite: `classifyAuthError` is exported for direct testing; the
 * Supabase client is a hand-rolled stub (no native modules pulled in).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { classifyAuthError, completeAuthSession } from '@/lib/auth/completeSession';

describe('classifyAuthError', () => {
  it('maps spent/expired/invalid-link hints to otp_expired', () => {
    for (const message of [
      'Email link is invalid or has expired',
      'Token has expired',
      'This link has already been used',
      'both auth code and code verifier should be non-empty',
      'access_denied',
      'Bad code',
      // Case-insensitive.
      'OTP EXPIRED',
    ]) {
      expect(classifyAuthError(message)).toBe('otp_expired');
    }
  });

  it('maps other / transport errors to exchange_failed', () => {
    expect(classifyAuthError('network request failed')).toBe('exchange_failed');
    expect(classifyAuthError('something unexpected')).toBe('exchange_failed');
    expect(classifyAuthError('')).toBe('exchange_failed');
    expect(classifyAuthError(null)).toBe('exchange_failed');
    expect(classifyAuthError(undefined)).toBe('exchange_failed');
  });
});

/** Minimal Supabase auth stub — only the methods completeAuthSession touches. */
function makeSupabase(overrides: {
  session?: unknown;
  exchangeError?: { message: string } | null;
  verifyError?: { message: string } | null;
}): SupabaseClient {
  return {
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: overrides.session ?? null }, error: null }),
      ),
      exchangeCodeForSession: jest.fn(() =>
        Promise.resolve({ error: overrides.exchangeError ?? null }),
      ),
      verifyOtp: jest.fn(() => Promise.resolve({ error: overrides.verifyError ?? null })),
    },
  } as unknown as SupabaseClient;
}

describe('completeAuthSession', () => {
  it('short-circuits ok (with otpType) when a session already exists', async () => {
    const supabase = makeSupabase({ session: { user: { id: 'u1' } } });
    const result = await completeAuthSession(supabase, { type: 'recovery' });
    expect(result).toEqual({ ok: true, otpType: 'recovery' });
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('returns the resolved otpType after a successful PKCE code exchange', async () => {
    const supabase = makeSupabase({ exchangeError: null });
    const result = await completeAuthSession(supabase, { code: 'abc', type: 'invite' });
    expect(result).toEqual({ ok: true, otpType: 'invite' });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('returns the resolved otpType after a successful OTP token verification', async () => {
    const supabase = makeSupabase({ verifyError: null });
    const result = await completeAuthSession(supabase, {
      token_hash: 'hash',
      type: 'recovery',
    });
    expect(result).toEqual({ ok: true, otpType: 'recovery' });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash',
      type: 'recovery',
    });
  });

  it('classifies an expired exchange error as otp_expired', async () => {
    const supabase = makeSupabase({
      exchangeError: { message: 'Email link is invalid or has expired' },
    });
    const result = await completeAuthSession(supabase, { code: 'stale' });
    expect(result).toEqual({
      ok: false,
      reason: 'otp_expired',
      message: 'Email link is invalid or has expired',
    });
  });

  it('classifies a non-hint verifyOtp error as exchange_failed', async () => {
    const supabase = makeSupabase({ verifyError: { message: 'network down' } });
    const result = await completeAuthSession(supabase, {
      token_hash: 'hash',
      type: 'magiclink',
    });
    expect(result).toEqual({ ok: false, reason: 'exchange_failed', message: 'network down' });
  });

  it('returns a generic reason when no code or token is present', async () => {
    const supabase = makeSupabase({});
    const result = await completeAuthSession(supabase, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('generic');
    }
  });

  it('surfaces an error param from the link as a discriminated reason', async () => {
    const supabase = makeSupabase({});
    const result = await completeAuthSession(supabase, {
      error: 'access_denied',
      error_description: 'Email link is invalid or has expired',
    });
    expect(result).toMatchObject({ ok: false, reason: 'otp_expired' });
    // Must not even attempt an exchange once the link reports an error.
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
