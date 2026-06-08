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

/** Merge Expo Router params and optional raw URL into auth callback fields. */
export function parseAuthCallbackParams(
  routeParams: Record<string, string | string[] | undefined>,
  rawUrl?: string | null,
): AuthCallbackParams {
  const hashParams = rawUrl ? parseHashParams(rawUrl) : {};
  const parsedUrl = rawUrl ? Linking.parse(rawUrl) : null;
  const queryParams = parsedUrl?.queryParams ?? {};

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
    otpType,
    error: get('error'),
    errorDescription: get('error_description'),
  };
}
