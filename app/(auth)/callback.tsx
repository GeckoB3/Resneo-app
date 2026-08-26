import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { completeAuthSession, type AuthErrorReason } from '@/lib/auth/completeSession';
import { getSupabase } from '@/lib/supabase';
import { spacing } from '@/theme/index';

/** Reason-specific error copy, mirroring the web AuthCallbackErrorBanner. */
const ERROR_COPY: Record<AuthErrorReason, { title: string; message: string }> = {
  otp_expired: {
    title: 'Link expired',
    message:
      'This sign-in link was already used or has expired. Ask your admin to resend the invitation, or request a new link from the sign-in screen.',
  },
  exchange_failed: {
    title: 'Sign-in failed',
    message:
      'We could not complete sign-in from that link. Use the latest link from your email, request a new one, or sign in with your password.',
  },
  generic: {
    title: 'Sign-in failed',
    message:
      'This sign-in link is invalid or has expired. Request a new link or sign in with your password.',
  },
};

/** OTP types that should land on the set-password screen rather than the app. */
const SET_PASSWORD_OTP_TYPES = new Set(['recovery', 'invite']);

/**
 * Handles magic-link deep links (resneo://callback?code=…).
 * Supabase PKCE exchanges the code for a session stored in SecureStore.
 *
 * Recovery/invite links route to /set-password (a top-level route — see
 * app/set-password.tsx) so invited staff + reset recipients choose a password
 * before continuing. Everything else lands on the app (`/`).
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [errorReason, setErrorReason] = useState<AuthErrorReason | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const supabase = getSupabase();
        const initialUrl = await Linking.getInitialURL();
        const result = await completeAuthSession(supabase, params, initialUrl);

        if (!result.ok) {
          if (active) {
            setErrorReason(result.reason);
          }
          return;
        }

        // Best-effort: backfill any guest/staff rows matched only by email to the
        // now-authenticated user (matches the web callback). Never block the
        // redirect on a claim failure — invited staff are normally linked by id.
        try {
          const { error: claimError } = await supabase.rpc('claim_user_account');
          if (claimError) {
            console.warn('[callback] claim_user_account:', claimError.message);
          }
        } catch (claimCaught) {
          console.warn(
            '[callback] claim_user_account threw:',
            claimCaught instanceof Error ? claimCaught.message : claimCaught,
          );
        }

        // Navigate even when `active` is false. Success here CREATES the session, which
        // flips the root layout's !session guard and unmounts this screen mid-exchange:
        // being unmounted is the normal success path, not a cancelled one. Gating these
        // replaces on `active` silently skipped them, which cost recovery recipients the
        // set-password screen (they landed signed in on the dashboard with their password
        // unchanged). The router is a global, so calling it from this closure after
        // unmount is safe; `active` still guards the setState calls above and below.
        // Invited staff + password-reset recipients must choose a password first.
        if (result.otpType && SET_PASSWORD_OTP_TYPES.has(result.otpType)) {
          router.replace('/set-password');
          return;
        }

        router.replace('/');
      } catch (caught) {
        if (!active) {
          return;
        }
        console.warn(
          '[callback] sign-in failed:',
          caught instanceof Error ? caught.message : caught,
        );
        setErrorReason('exchange_failed');
      }
    }

    void run();

    return () => {
      active = false;
    };
    // Run exactly once. useLocalSearchParams returns a fresh object every render,
    // so depending on it re-ran this effect on any re-render and re-entered the
    // one-shot PKCE exchangeCodeForSession with an already-consumed code —
    // surfacing a false "link expired" on a perfectly valid link. The deep link
    // only needs processing once; `active` still guards setState-after-unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorReason) {
    const copy = ERROR_COPY[errorReason];
    return (
      <View style={styles.centered}>
        <Text variant="heading" style={styles.center}>
          {copy.title}
        </Text>
        <Text variant="bodySmall" tone="secondary" style={styles.center}>
          {copy.message}
        </Text>
        <Button
          label="Back to sign in"
          variant="secondary"
          onPress={() => {
            router.replace('/sign-in');
          }}
        />
      </View>
    );
  }

  return <LoadingState message="Signing you in…" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.base,
    padding: spacing.xl,
  },
  center: {
    textAlign: 'center',
  },
});
