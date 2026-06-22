import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticError, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { useChangeOwnPassword } from '@/lib/queries/useTeamMutations';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Set-password screen for invited staff and password-reset recipients.
 *
 * Reached from `app/(auth)/callback.tsx` after a `recovery`/`invite` OTP/PKCE
 * exchange resolves a session — at that point the user is authenticated but has
 * not chosen a password. Mirrors the web `/auth/set-password` page and reuses
 * the `account.tsx` validation (min 8 + confirm match).
 *
 * This lives as a TOP-LEVEL route (sibling of `(app)`/`(auth)` in the root
 * `Stack`), NOT inside the `(auth)` group: the root layout gates `(auth)` behind
 * `guard={!session}`, so once the callback exchange creates a session the
 * `(auth)` group unmounts. A set-password screen must be reachable *with* a
 * session, so it cannot live under `(auth)`. The root `Stack` registers it
 * unguarded (like the dev `design-system` route) so `callback.tsx` can route to
 * it after the exchange.
 *
 * POST /api/venue/staff/change-password ({ new_password }) — the app's existing
 * endpoint, NOT the web's `/api/account/password`. On success we route into the
 * app (`/`); the root `Stack.Protected` already keeps the session in `(app)`.
 *
 * Fabric focus rule (project memory): never setState in onFocus/onBlur. Field
 * state flows from onChangeText + the explicit submit handler only.
 */
export default function SetPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const { session, isLoading } = useAuth();
  const changePassword = useChangeOwnPassword();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // This screen is only reachable post-exchange WITH a session. If there's none
  // (an expired/half-finished recovery link, or a stray deep link), the
  // change-password POST would 401 into a dead-end with no way back — send the
  // user to sign in so they can request a fresh link.
  useEffect(() => {
    if (!isLoading && !session) {
      router.replace('/sign-in');
    }
  }, [isLoading, session, router]);

  async function handleSubmit() {
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      hapticWarning();
      setError(t('setPassword.tooShort', { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      hapticWarning();
      setError(t('setPassword.mismatch'));
      return;
    }

    try {
      await changePassword.mutateAsync({ new_password: newPassword });
      hapticSuccess();
      toast.success(t('setPassword.success'));
      router.replace('/');
    } catch (err) {
      hapticError();
      const message = err instanceof ApiError ? err.message : t('setPassword.error');
      setError(message);
    }
  }

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={styles.container}>
      <View style={styles.inner}>
        <View style={styles.headerBlock}>
          <Text variant="title" style={styles.center}>
            {t('setPassword.title')}
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.center}>
            {t('setPassword.description')}
          </Text>
        </View>

        <Card>
          <View style={styles.fields}>
            <Input
              label={t('setPassword.newLabel')}
              value={newPassword}
              onChangeText={(v) => {
                setNewPassword(v);
                setError(null);
              }}
              placeholder={t('setPassword.newPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
            />
            <Input
              label={t('setPassword.confirmLabel')}
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setError(null);
              }}
              placeholder={t('setPassword.confirmPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              error={error ?? undefined}
              returnKeyType="done"
              onSubmitEditing={() => void handleSubmit()}
            />
            <Button
              label={t('setPassword.submit')}
              fullWidth
              loading={changePassword.isPending}
              disabled={!newPassword || !confirmPassword}
              onPress={() => void handleSubmit()}
            />
          </View>
        </Card>
      </View>
    </Screen>
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
  headerBlock: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  fields: {
    gap: spacing.md,
  },
});
