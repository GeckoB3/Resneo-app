import { useEffect, useState } from 'react';

import { isBackendConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

/**
 * Returns the current Supabase access token for Bearer auth on /api/venue/* routes.
 * Returns null when env is not configured or the user is signed out.
 */
export function useAccessToken(): string | null {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isBackendConfigured()) {
      setAccessToken(null);
      return;
    }

    const supabase = getSupabase();

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setAccessToken(session?.access_token ?? null);
    };

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return accessToken;
}
