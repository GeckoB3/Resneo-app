import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { useSetPassword, useSignOutEverywhere } from '@/lib/queries/useCustomerAccount';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/** Matches the route's own rule, so the refusal is not a round trip away. */
const MIN_PASSWORD = 8;

/**
 * Password and sessions.
 *
 * "Set" rather than "change", and the wording is deliberate: most customers
 * have never had a password. The web creates their account from the address
 * they booked with, so they sign in by email link, and asking for a current
 * password would be asking for something that does not exist.
 */
export function AccountSecuritySection() {
  const toast = useToast();
  const { signOut } = useAuth();
  const setPassword = useSetPassword();
  const signOutEverywhere = useSignOutEverywhere();

  const [password, setPasswordValue] = useState('');
  const [confirming, setConfirming] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        PASSWORD AND SECURITY
      </Text>

      <Text variant="bodySmall" tone="secondary" style={styles.gap}>
        You can sign in with an email link at any time. Setting a password is optional, and gives
        you a second way in.
      </Text>

      <Input
        label="New password"
        value={password}
        onChangeText={setPasswordValue}
        secureTextEntry
        autoCapitalize="none"
        error={tooShort ? `Use at least ${MIN_PASSWORD} characters` : undefined}
      />

      <Button
        label="Save password"
        disabled={password.length < MIN_PASSWORD}
        loading={setPassword.isPending}
        onPress={() =>
          setPassword.mutate(password, {
            onSuccess: () => {
              setPasswordValue('');
              toast.success('Password saved.');
            },
            onError: () => toast.error('Could not save that password.'),
          })
        }
        style={styles.gap}
      />

      <View style={styles.divider} />

      <Button
        label="Sign out on all devices"
        variant="secondary"
        onPress={() => setConfirming(true)}
      />

      <ConfirmSheet
        visible={confirming}
        title="Sign out everywhere?"
        /*
          Says that THIS device is included, because it is, and somebody who
          expected to stay signed in here would experience it as being thrown
          out rather than as the thing they asked for.
        */
        message="Every device signed in to your account is signed out, including this one. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        cancelLabel="Stay signed in"
        loading={signOutEverywhere.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          signOutEverywhere.mutate(undefined, {
            onSuccess: () => {
              // The server has revoked the session; sign out locally so the app
              // does not sit holding a token it knows is dead.
              void signOut();
            },
            onError: () => toast.error('Could not sign out everywhere. Please try again.'),
          });
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
  divider: { marginTop: spacing.base },
});
