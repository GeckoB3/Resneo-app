import Constants from 'expo-constants';

/**
 * Public env vars are embedded at build time via Expo's EXPO_PUBLIC_ prefix.
 * Copy .env.example to .env.local and fill in values from your reserve-ni project.
 */
function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and add your Resneo backend values.`,
    );
  }
  return value;
}

/** Optional at Phase 0 — throws only when Supabase client is first used. */
export function getSupabaseUrl(): string {
  return requirePublicEnv('EXPO_PUBLIC_SUPABASE_URL');
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
  return requirePublicEnv('EXPO_PUBLIC_API_URL');
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
