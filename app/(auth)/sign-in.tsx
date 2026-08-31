import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SignInModeTabs, type SignInMode } from '@/components/auth/SignInModeTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import {
  SIGN_IN_CODE_MAX_LENGTH,
  isLikelySignInCode,
  normaliseSignInCode,
} from '@/lib/auth/magic-link';
import { isBackendConfigured } from '@/lib/env';
import { useAuth } from '@/providers/AuthProvider';
import { minTouchTarget, spacing } from '@/theme/index';

/** Generous tap area for the small secondary text links. */
const LINK_HIT_SLOP = { top: 8, bottom: 8, left: 12, right: 12 };

// Full-colour RESNEO lockup (knot + wordmark) — the brand mark for the sign-in.
const LOGO = require('../../assets/brand/logo-lockup.png');

type SignInView = 'sign-in' | 'forgot-password' | 'magic-sent';

/** Centred, brand-led shell shared by every sign-in view. */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={styles.container}>
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <Image source={LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Resneo" />
        </View>
        {children}
      </View>
    </Screen>
  );
}

/**
 * Staff sign-in — password or magic link, matching the web /login (staff default: Password tab).
 */
export default function SignInScreen() {
  const { signInWithEmail, verifySignInCode, signInWithPassword, requestPasswordReset, initError } =
    useAuth();

  const [view, setView] = useState<SignInView>('sign-in');
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  /*
    The code from the branded email, and whether that email is the one on
    its way. Supabase's fallback email carries no code, so the box is only
    offered when there is a code to type.
  */
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  async function handlePasswordSignIn() {
    setError(null);
    setLoading(true);
    track(ANALYTICS_EVENTS.signInStarted, { method: 'password' });
    try {
      const result = await signInWithPassword(email, password);
      if (result.error) {
        setError(passwordSignInMessage(result.error));
        track(ANALYTICS_EVENTS.signInFailed, { method: 'password', reason: result.error });
      }
      // Session update routes to (app) via Stack.Protected in root layout.
    } finally {
      setLoading(false);
    }
  }

  /*
    "Invalid login credentials" is what GoTrue says both for a wrong password
    and for an account that has NO password, and the two need different advice.

    Customers overwhelmingly have no password: the web creates their account
    lazily from the email address they booked with, so there was never a moment
    when they chose one. Telling such a person their credentials are invalid
    sends them to re-type something that does not exist, and this screen opens
    on the Password tab, so it is the first thing they meet.

    The tab default is deliberately NOT changed. Staff are the people signing in
    today and they do have passwords; flipping the default would fix a stranger's
    problem by making every existing user's sign-in slower. Naming the other way
    in is enough, and it costs the person who really did mistype nothing but a
    clause.
  */
  function passwordSignInMessage(raw: string): string {
    if (/invalid login credentials/i.test(raw)) {
      return 'That email and password did not match. If you have never set a password, use the Magic Link tab and we will email you a link to sign in.';
    }
    return raw;
  }

  async function handleMagicLink() {
    setError(null);
    setLoading(true);
    track(ANALYTICS_EVENTS.signInStarted, { method: 'magic' });
    try {
      const result = await signInWithEmail(email);
      if (result.error) {
        setError(result.error);
        track(ANALYTICS_EVENTS.signInFailed, { method: 'magic', reason: result.error });
        return;
      }
      setCode('');
      setCodeSent(result.codeSent);
      setView('magic-sent');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    setError(null);
    setLoading(true);
    try {
      const result = await verifySignInCode(email, code);
      if (result.error) {
        // The server's own words. "Token has expired or is invalid" tells
        // somebody to request a new one; a generic failure does not.
        setError(result.error);
        track(ANALYTICS_EVENTS.signInFailed, { method: 'magic', reason: result.error });
        return;
      }
      // Nothing to navigate to: the session lands and the root router moves.
      track(ANALYTICS_EVENTS.signInSucceeded, { method: 'magic' });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccessMessage('Check your inbox for a link to reset your password.');
    } finally {
      setLoading(false);
    }
  }

  if (initError) {
    return (
      <AuthShell>
        <View style={styles.headerBlock}>
          <Text variant="title" style={styles.center}>
            Setup required
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.center}>
            Copy .env.example to .env.local and add your Supabase credentials before signing in.
          </Text>
        </View>
        <Text variant="bodySmall" tone="danger" style={styles.center}>
          {initError}
        </Text>
      </AuthShell>
    );
  }

  if (view === 'magic-sent') {
    return (
      <AuthShell>
        <View style={styles.headerBlock}>
          <Text variant="title" style={styles.center}>
            Check your email
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.center}>
            {codeSent
              ? `We sent a code to ${email.trim()}. Enter it below to sign in.`
              : `We sent a sign-in link to ${email.trim()}. Open it on this device to continue.`}
          </Text>
        </View>

        {codeSent ? (
          /*
            Typing the code is the reliable way in, so it leads.

            The link in that email opens the website, and following it back into
            the app means a redirect into a custom scheme that depends on an
            allowlist entry and on the mail client and browser handing it off.
            When that fails it fails silently, on the website, with nothing to
            show for it. A typed code depends on none of that.
          */
          <Card>
            {/*
              "Sign-in code", with no length in the label and none in the
              placeholder. The number of digits is a per-project Supabase
              setting: staging sends eight, and a label reading "Six-digit code"
              above a box holding eight tells somebody their correct code is
              wrong.
            */}
            <Input
              label="Sign-in code"
              value={code}
              onChangeText={(next) => setCode(normaliseSignInCode(next))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              placeholder="Code from the email"
              maxLength={SIGN_IN_CODE_MAX_LENGTH}
            />
            <Button
              label="Sign in"
              disabled={!isLikelySignInCode(code)}
              loading={loading}
              onPress={() => void handleVerifyCode()}
              style={styles.codeButton}
            />
            {error ? (
              <Text variant="caption" tone="danger" style={styles.codeError}>
                {error}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted" style={styles.codeError}>
              The email also has a button, which opens the ResNeo website. The code signs you in
              here.
            </Text>
          </Card>
        ) : (
          <Card>
            <Text variant="bodySmall" tone="secondary">
              The link expires after a short time. If you do not see the email, check spam or try
              another sign-in method below.
            </Text>
          </Card>
        )}

        <View style={styles.formBlock}>
          <Button
            label={codeSent ? 'Send another code' : 'Send another link'}
            variant="secondary"
            onPress={() => {
              setView('sign-in');
              setMode('magic');
              setError(null);
              setCode('');
            }}
          />
          <Pressable
            accessibilityRole="button"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => {
              setView('sign-in');
              setMode('password');
              setError(null);
            }}
            style={styles.linkWrap}>
            <Text variant="label" tone="brand">
              Sign in with password instead
            </Text>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  if (view === 'forgot-password') {
    return (
      <AuthShell>
        <View style={styles.headerBlock}>
          <Text variant="title" style={styles.center}>
            Reset password
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.center}>
            Enter your email and we will send you a link to choose a new password.
          </Text>
        </View>

        <View style={styles.formBlock}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@email.com"
            error={error ?? undefined}
          />

          {successMessage ? (
            <Text variant="bodySmall" tone="success">
              {successMessage}
            </Text>
          ) : null}

          <Button
            label={loading ? 'Sending…' : 'Send reset link'}
            loading={loading}
            onPress={() => {
              void handleForgotPassword();
            }}
          />

          <Pressable
            accessibilityRole="button"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => {
              setView('sign-in');
              setError(null);
              setSuccessMessage(null);
            }}
            style={styles.linkWrap}>
            <Text variant="label" tone="brand">
              Back to sign in
            </Text>
          </Pressable>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <View style={styles.headerBlock}>
        <Text variant="title" style={styles.center}>
          Sign in
        </Text>
      </View>

      {!isBackendConfigured() ? (
        <Card>
          <Text variant="bodySmall" tone="secondary">
            Backend env vars are missing — add .env.local before calling venue APIs.
          </Text>
        </Card>
      ) : null}

      <View style={styles.formBlock}>
        <SignInModeTabs
          mode={mode}
          onModeChange={(next) => {
            setMode(next);
            setError(null);
          }}
        />

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@email.com"
          error={mode === 'magic' ? (error ?? undefined) : undefined}
        />

        {mode === 'password' ? (
          <>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              placeholder="Your password"
              error={error ?? undefined}
            />

            <Button
              label={loading ? 'Signing in…' : 'Sign in'}
              loading={loading}
              onPress={() => {
                void handlePasswordSignIn();
              }}
            />

            <Pressable
              accessibilityRole="button"
              hitSlop={LINK_HIT_SLOP}
              onPress={() => {
                setView('forgot-password');
                setError(null);
                setSuccessMessage(null);
              }}
              style={styles.linkWrap}>
              <Text variant="label" tone="brand">
                Forgot password?
              </Text>
            </Pressable>
          </>
        ) : (
          <Button
            label={loading ? 'Sending…' : 'Send magic link'}
            loading={loading}
            onPress={() => {
              void handleMagicLink();
            }}
          />
        )}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  codeButton: { marginTop: spacing.base },
  codeError: { marginTop: spacing.sm },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: spacing.lg,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logo: {
    // Sized to the asset's own ratio (1200x324 = 3.70) so `contain` has no slack
    // to letterbox. The previous box was 208x50 (4.16), cut for the older, wider
    // lockup at 4.30 - against the new artwork that made it height-bound and it
    // rendered 185px wide, short of the intended 208.
    width: 208,
    height: 56,
  },
  headerBlock: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  formBlock: {
    gap: spacing.base,
  },
  linkWrap: {
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
});
