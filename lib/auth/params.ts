import * as Linking from 'expo-linking';

/**
 * Helpers for parsing auth callback query/hash params from deep links.
 * Adapted from the web app's auth-link patterns for React Native.
 */

const SUPPORTED_OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change'] as const;

export type SupportedOtpType = (typeof SUPPORTED_OTP_TYPES)[number];

export type AuthCallbackParams = {
  code?: string;
  tokenHash?: string;
  /**
   * Implicit-flow credentials. Present when the link was issued without a PKCE
   * code_challenge, in which case GoTrue redirects to
   * `resneo://callback#access_token=...&refresh_token=...` and there is no `code`
   * or `token_hash` to exchange. Admin-generated links (`generateLink`) never carry
   * a challenge, so they always arrive in this shape.
   */
  accessToken?: string;
  refreshToken?: string;
  otpType?: SupportedOtpType;
  error?: string;
  errorDescription?: string;
};

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function isSupportedOtpType(value: string | undefined): value is SupportedOtpType {
  return value != null && (SUPPORTED_OTP_TYPES as readonly string[]).includes(value);
}

/** Parse hash fragment (#access_token=...) into key/value pairs. */
export function parseHashParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) {
    return {};
  }

  const hash = url.slice(hashIndex + 1);
  const params = new URLSearchParams(hash);
  const result: Record<string, string> = {};

  params.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

/**
 * Query params from a raw deep link. `Linking.parse` reads Expo's runtime constants and
 * throws when they are unavailable, so it is guarded: losing the whole link to an
 * exception would turn a valid sign-in into "invalid or has expired". Standard URL
 * parsing is the fallback, and handles custom schemes (`resneo://callback?a=1`) fine.
 */
function parseQueryParams(url: string): Record<string, string> {
  const collect = (search: string): Record<string, string> => {
    const out: Record<string, string> = {};
    new URLSearchParams(search).forEach((value, key) => {
      out[key] = value;
    });
    return out;
  };

  try {
    const parsed = Linking.parse(url);
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.queryParams ?? {})) {
      const first = firstString(value as string | string[] | undefined);
      if (first != null) {
        out[key] = first;
      }
    }
    return out;
  } catch {
    try {
      return collect(new URL(url).search);
    } catch {
      return {};
    }
  }
}

/** Merge Expo Router params and optional raw URL into auth callback fields. */
export function parseAuthCallbackParams(
  routeParams: Record<string, string | string[] | undefined>,
  rawUrl?: string | null,
): AuthCallbackParams {
  const hashParams = rawUrl ? parseHashParams(rawUrl) : {};
  const queryParams = rawUrl ? parseQueryParams(rawUrl) : {};

  const get = (key: string): string | undefined => {
    return (
      firstString(routeParams[key]) ??
      firstString(queryParams[key] as string | string[] | undefined) ??
      hashParams[key] ??
      undefined
    );
  };

  const rawOtpType = get('type');
  const otpType = isSupportedOtpType(rawOtpType) ? rawOtpType : undefined;

  return {
    code: get('code'),
    tokenHash: get('token_hash'),
    accessToken: get('access_token'),
    refreshToken: get('refresh_token'),
    otpType,
    error: get('error'),
    errorDescription: get('error_description'),
  };
}
