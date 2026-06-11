import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SignInModeTabs, type SignInMode } from '@/components/auth/SignInModeTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { isBackendConfigured } from '@/lib/env';
import { useAuth } from '@/providers/AuthProvider';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SignInView = 'sign-in' | 'forgot-password' | 'magic-sent';

/**
 * Staff sign-in — password or magic link, matching reserve-ni /login (staff default: Password tab).
 */
export default function SignInScreen() {
  const { colors } = useTheme();
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

    try {
      const result = await signInWithPassword(email, password);
      if (result.error) {
        setError(result.error);
      }
      // Session update routes to (app) via Stack.Protected in root layout.
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    setError(null);
    setLoading(true);

    try {
      const result = await signInWithEmail(email);
      if (result.error) {
        setError(result.error);
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
      <Screen>
        <Text style={[styles.title, { color: colors.text }]}>Setup required</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Copy .env.example to .env.local and add your Supabase credentials before signing in.
        </Text>
        <Text style={[styles.inlineError, { color: colors.danger }]}>{initError}</Text>
      </Screen>
    );
  }

  if (view === 'magic-sent') {
    return (
      <Screen scroll>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Check your email</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We sent a sign-in link to {email.trim()}. Open it on this device to continue.
          </Text>
        </View>

        <Card>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            The link expires after a short time. If you do not see the email, check spam or try
            another sign-in method below.
          </Text>
        </Card>

        <Button
          label="Send another link"
          variant="secondary"
          style={styles.action}
          onPress={() => {
            setView('sign-in');
            setMode('magic');
            setError(null);
          }}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setView('sign-in');
            setMode('password');
            setError(null);
          }}
          style={styles.textLinkWrap}>
          <Text style={[styles.textLink, { color: colors.brand }]}>Sign in with password instead</Text>
        </Pressable>
      </Screen>
    );
  }

  if (view === 'forgot-password') {
    return (
      <Screen scroll>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Reset password</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Enter your email and we&apos;ll send you a link to choose a new password.
          </Text>
        </View>

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@salon.com"
          error={error ?? undefined}
        />

        {successMessage ? (
          <Text style={[styles.success, { color: colors.success }]}>{successMessage}</Text>
        ) : null}

        <Button
          label={loading ? 'Sending…' : 'Send reset link'}
          loading={loading}
          style={styles.action}
          onPress={() => {
            void handleForgotPassword();
          }}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setView('sign-in');
            setError(null);
            setSuccessMessage(null);
          }}
          style={styles.textLinkWrap}>
          <Text style={[styles.textLink, { color: colors.brand }]}>Back to sign in</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Resneo Staff</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Sign in with your work email. This app is for venue owners and staff only.
        </Text>
      </View>

      {!isBackendConfigured() ? (
        <Card style={styles.hintCard}>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            Backend env vars are missing — add .env.local before calling venue APIs in later phases.
          </Text>
        </Card>
      ) : null}

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
        placeholder="you@salon.com"
        error={mode === 'magic' ? (error ?? undefined) : undefined}
        containerStyle={styles.fieldGap}
      />

      {mode === 'password' ? (
        <>
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="Your password"
            error={error ?? undefined}
            containerStyle={styles.fieldGap}
          />

          <Button
            label={loading ? 'Signing in…' : 'Sign in'}
            loading={loading}
            style={styles.action}
            onPress={() => {
              void handlePasswordSignIn();
            }}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setView('forgot-password');
              setError(null);
              setSuccessMessage(null);
            }}
            style={styles.textLinkWrap}>
            <Text style={[styles.textLink, { color: colors.brand }]}>Forgot password?</Text>
          </Pressable>
        </>
      ) : (
        <Button
          label={loading ? 'Sending…' : 'Send magic link'}
          loading={loading}
          style={styles.action}
          onPress={() => {
            void handleMagicLink();
          }}
        />
      )}

    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
  },
  hintCard: {
    marginBottom: spacing.base,
  },
  cardBody: {
    ...typography.bodySmall,
  },
  fieldGap: {
    marginTop: spacing.base,
  },
  action: {
    marginTop: spacing.xl,
  },
  textLinkWrap: {
    alignItems: 'center',
    marginTop: spacing.base,
    paddingVertical: spacing.sm,
  },
  textLink: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  inlineError: {
    ...typography.bodySmall,
    marginTop: spacing.base,
  },
  success: {
    ...typography.bodySmall,
    marginTop: spacing.base,
  },
});
