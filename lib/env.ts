import Constants from 'expo-constants';

/**
 * Public env vars are embedded at BUILD time via Expo's EXPO_PUBLIC_ prefix.
 * Copy .env.example to .env.local and fill in values from your reserve-ni project.
 *
 * IMPORTANT: Expo/Metro only inlines EXPO_PUBLIC_* vars for STATIC member access —
 * i.e. `process.env.EXPO_PUBLIC_FOO`. A dynamic read like `process.env[name]` is
 * NOT replaced at build time, so it resolves to `undefined` in a production bundle
 * (there is no runtime `process.env` on device). Every getter below must therefore
 * reference the literal key directly.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and add your Resneo backend values.`,
    );
  }
  return value;
}

/** Optional at Phase 0 — throws only when Supabase client is first used. */
export function getSupabaseUrl(): string {
  return required(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL');
}

export function getSupabaseAnonKey(): string {
  const value =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY (or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Copy .env.example to .env.local.',
    );
  }
  return value;
}

export function getApiUrl(): string {
  return required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL');
}

/**
 * Base URL of the staff WEB dashboard (Next.js). Prefers EXPO_PUBLIC_WEB_URL and
 * falls back to EXPO_PUBLIC_API_URL for single-host deploys. Never has a trailing
 * slash. Use this for "Manage on web" link-outs — they must target the dashboard
 * origin, NOT the API origin (sending a user to `…/api/...` was the prior bug).
 */
export function getWebUrl(): string {
  const raw = process.env.EXPO_PUBLIC_WEB_URL || process.env.EXPO_PUBLIC_API_URL || '';
  return raw.replace(/\/$/, '');
}

/**
 * Stripe PLATFORM publishable key (pk_test_/pk_live_), needed by the Stripe
 * Terminal SDK at init for in-person payments (Tap to Pay design doc §7.4).
 * Publishable keys are public by design. Returns null when unset so the
 * Terminal provider can degrade gracefully (no init, no payment surface)
 * instead of crashing venues that have in-person payments enabled before the
 * build carries a key.
 */
export function getStripePublishableKey(): string | null {
  return process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/** True when all backend env vars are present (used to show setup hints in dev). */
export function isBackendConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
      (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) &&
      process.env.EXPO_PUBLIC_API_URL,
  );
}
