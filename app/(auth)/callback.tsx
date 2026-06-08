import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { completeAuthSession } from '@/lib/auth/completeSession';
import { getSupabase } from '@/lib/supabase';

/**
 * Handles magic-link deep links (resneo://callback?code=…).
 * Supabase PKCE exchanges the code for a session stored in SecureStore.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const supabase = getSupabase();
        const initialUrl = await Linking.getInitialURL();
        const result = await completeAuthSession(supabase, params, initialUrl);

        if (!active) {
          return;
        }

        if (!result.ok) {
          setError(result.message);
          return;
        }

        router.replace('/');
      } catch (caught) {
        if (!active) {
          return;
        }
        const message =
          caught instanceof Error ? caught.message : 'Could not complete sign-in.';
        setError(message);
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [params, router]);

  if (error) {
    return (
      <ErrorState
        title="Sign-in failed"
        message={error}
        onRetry={() => {
          router.replace('/sign-in');
        }}
      />
    );
  }

  return <LoadingState message="Signing you in…" />;
}
