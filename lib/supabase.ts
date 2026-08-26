import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env';

const SECURE_STORE_KEY_PREFIX = 'reserveni.supabase.';

/**
 * Supabase session storage adapter using expo-secure-store on native.
 * We avoid localStorage on web (per project rules); web dev uses in-memory storage only.
 */
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return webMemoryStore.get(key) ?? null;
    }
    return SecureStore.getItemAsync(`${SECURE_STORE_KEY_PREFIX}${key}`);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      webMemoryStore.set(key, value);
      return;
    }
    await SecureStore.setItemAsync(`${SECURE_STORE_KEY_PREFIX}${key}`, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      webMemoryStore.delete(key);
      return;
    }
    await SecureStore.deleteItemAsync(`${SECURE_STORE_KEY_PREFIX}${key}`);
  },
};

const webMemoryStore = new Map<string, string>();

let supabaseClient: SupabaseClient | null = null;

/**
 * Singleton Supabase client for auth and realtime.
 * Phase 1 will use this for magic-link sign-in.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        storage: secureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Must be set explicitly: supabase-js defaults to 'implicit'. Under implicit
        // `signInWithOtp` sends no code_challenge, so GoTrue returns the session in the
        // URL *fragment* (`resneo://callback#access_token=...`) rather than as `?code=`.
        // `app/(auth)/callback.tsx` was written for the PKCE code exchange, so every magic
        // link failed with "invalid or has expired" until this was pinned. `completeAuthSession`
        // now also accepts the fragment form, but PKCE is the flow we intend.
        flowType: 'pkce',
      },
    });
  }
  return supabaseClient;
}
