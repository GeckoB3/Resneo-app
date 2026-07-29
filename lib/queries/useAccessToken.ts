import { useEffect, useState } from 'react';

import { isBackendConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

/**
 * Last known token, shared by every hook instance in the process.
 *
 * This hook used to start each instance at `null` and fill it in from an async
 * `getSession()`, so EVERY fresh mount was signed-out for a tick. That is
 * invisible to a component which merely renders whatever the token fetches, but
 * it breaks any component that acts the moment it mounts.
 *
 * The payment sheet does exactly that: returning from reader pairing re-mounts
 * `CardCollectSection`, which immediately auto-collects. The mutation therefore
 * fired inside that tick and failed with a bare "Missing access token", while a
 * second, manual press — by which point the effect had resolved — succeeded.
 *
 * Seeding from the cache lets a remount pick up where the previous instance left
 * off. `onAuthStateChange` keeps it current, including clearing it on sign-out,
 * and `apiFetch` already refreshes and retries once on a 401, so a briefly stale
 * value cannot strand a request.
 */
let cachedAccessToken: string | null = null;

/**
 * Returns the current Supabase access token for Bearer auth on /api/venue/* routes.
 * Returns null when env is not configured or the user is signed out.
 */
export function useAccessToken(): string | null {
  const [accessToken, setAccessToken] = useState<string | null>(cachedAccessToken);

  useEffect(() => {
    /**
     * Nothing can have signed in without a configured backend, so the cache is
     * already null and there is nothing to clear. Bailing out beats the
     * `setAccessToken(null)` that used to sit here: a synchronous setState in an
     * effect body is the cascading-render pattern `react-hooks/set-state-in-effect`
     * rejects, and it was only ever a no-op writing null over null.
     */
    if (!isBackendConfigured()) return;

    const supabase = getSupabase();

    /** Keep the shared cache and this instance in step. */
    const apply = (token: string | null) => {
      cachedAccessToken = token;
      setAccessToken(token);
    };

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      apply(session?.access_token ?? null);
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return accessToken;
}
