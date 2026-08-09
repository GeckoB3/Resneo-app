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
  const { signInWithEmail, signInWithPassword, requestPasswordReset, initError } = useAuth();

  const [view, setView] = useState<SignInView>('sign-in');
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handlePasswordSignIn() {
    setError(null);
    setLoading(true);
    track(ANALYTICS_EVENTS.signInStarted, { method: 'password' });
    try {
      const result = await signInWithPassword(email, password);
      if (result.error) {
        setError(result.error);
        track(ANALYTICS_EVENTS.signInFailed, { method: 'password', reason: result.error });
      }
      // Session update routes to (app) via Stack.Protected in root layout.
    } finally {
      setLoading(false);
    }
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
      setView('magic-sent');
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
            We sent a sign-in link to {email.trim()}. Open it on this device to continue.
          </Text>
        </View>

        <Card>
          <Text variant="bodySmall" tone="secondary">
            The link expires after a short time. If you do not see the email, check spam or try
            another sign-in method below.
          </Text>
        </Card>

        <View style={styles.formBlock}>
          <Button
            label="Send another link"
            variant="secondary"
            onPress={() => {
              setView('sign-in');
              setMode('magic');
              setError(null);
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
