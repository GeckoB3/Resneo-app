import type { SupabaseClient } from '@supabase/supabase-js';

import { parseAuthCallbackParams, type AuthCallbackParams } from '@/lib/auth/params';

export type CompleteAuthSessionResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Finish sign-in from a magic-link deep link (PKCE code or OTP token hash).
 * Returns ok when a session exists or was created successfully.
 */
export async function completeAuthSession(
  supabase: SupabaseClient,
  routeParams: Record<string, string | string[] | undefined>,
  rawUrl?: string | null,
): Promise<CompleteAuthSessionResult> {
  const params = parseAuthCallbackParams(routeParams, rawUrl);

  const authError = getAuthErrorMessage(params);
  if (authError) {
    return { ok: false, message: authError };
  }

  const {
    data: { session: existingSession },
  } = await supabase.auth.getSession();

  if (existingSession) {
    return { ok: true };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, message: mapExchangeError(error.message) };
    }
    return { ok: true };
  }

  if (params.tokenHash && params.otpType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.otpType,
    });
    if (error) {
      return { ok: false, message: mapExchangeError(error.message) };
    }
    return { ok: true };
  }

  return {
    ok: false,
    message: 'Sign-in link is invalid or has expired. Request a new magic link.',
  };
}

function getAuthErrorMessage(params: AuthCallbackParams): string | null {
  if (!params.error && !params.errorDescription) {
    return null;
  }

  const detail = params.errorDescription ?? params.error ?? 'Sign-in failed';
  return mapExchangeError(detail);
}

function mapExchangeError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('expired') ||
    lower.includes('invalid') ||
    lower.includes('already been used') ||
    lower.includes('code verifier')
  ) {
    return 'This sign-in link has expired. Request a new magic link.';
  }

  return message;
}
