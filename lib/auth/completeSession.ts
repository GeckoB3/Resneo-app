import type { SupabaseClient } from '@supabase/supabase-js';

import {
  parseAuthCallbackParams,
  type AuthCallbackParams,
  type SupportedOtpType,
} from '@/lib/auth/params';

/**
 * Discriminated failure reason for an auth-callback exchange, mirroring the web
 * `AuthErrorDetail` (`_reference/Resneo/src/lib/auth-link.ts`):
 *   - `otp_expired`   — the link was already used / has expired / is invalid.
 *   - `exchange_failed` — the PKCE code or OTP token could not be exchanged.
 *   - `generic`       — no usable code/token was present at all.
 * `callback.tsx` maps each to reason-specific copy + a "Back to sign in" action.
 */
export type AuthErrorReason = 'otp_expired' | 'exchange_failed' | 'generic';

export type CompleteAuthSessionResult =
  | { ok: true; otpType?: SupportedOtpType }
  | { ok: false; reason: AuthErrorReason; message: string };

/** Keyword hints that mean the link is spent/expired rather than a transport failure. */
const OTP_EXPIRED_HINTS = [
  'access_denied',
  'expired',
  'invalid',
  'already been used',
  'code verifier',
  'bad code',
] as const;

/**
 * Finish sign-in from a magic-link deep link (PKCE code or OTP token hash).
 * Returns ok when a session exists or was created successfully. On success the
 * resolved `otpType` is surfaced so the caller can route recovery/invite links
 * to the set-password screen.
 */
export async function completeAuthSession(
  supabase: SupabaseClient,
  routeParams: Record<string, string | string[] | undefined>,
  rawUrl?: string | null,
): Promise<CompleteAuthSessionResult> {
  const params = parseAuthCallbackParams(routeParams, rawUrl);

  const authError = getAuthErrorResult(params);
  if (authError) {
    return authError;
  }

  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  if (existingSession) {
    return { ok: true, otpType: params.otpType };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, reason: classifyAuthError(error.message), message: error.message };
    }
    return { ok: true, otpType: params.otpType };
  }

  if (params.tokenHash && params.otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.otpType,
    });
    if (error) {
      return { ok: false, reason: classifyAuthError(error.message), message: error.message };
    }
    return { ok: true, otpType: params.otpType };
  }

  return {
    ok: false,
    reason: 'generic',
    message: 'Sign-in link is invalid or has expired. Request a new magic link.',
  };
}

function getAuthErrorResult(
  params: AuthCallbackParams,
): { ok: false; reason: AuthErrorReason; message: string } | null {
  if (!params.error && !params.errorDescription) {
    return null;
  }

  const detail = params.errorDescription ?? params.error ?? 'Sign-in failed';
  return { ok: false, reason: classifyAuthError(detail), message: detail };
}

/**
 * Map a raw Supabase error message to a discriminated reason. Mirrors the web's
 * `mapAuthErrorMessageToDetail` (spent-link hints → `otp_expired`, otherwise the
 * exchange itself failed). Exported for unit tests.
 */
export function classifyAuthError(message: string | null | undefined): AuthErrorReason {
  const lower = (message ?? '').toLowerCase();
  if (OTP_EXPIRED_HINTS.some((hint) => lower.includes(hint))) {
    return 'otp_expired';
  }
  return 'exchange_failed';
}
