import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError, isApiErrorBody } from '@/lib/api/client';
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
  const [confirm, setConfirmValue] = useState('');
  const [confirming, setConfirming] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  /*
    Only once they have typed something to compare. Showing "does not match"
    against an empty box would flag every password the moment it was entered.
  */
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSave = password.length >= MIN_PASSWORD && password === confirm;

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
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder={`At least ${MIN_PASSWORD} characters`}
        error={tooShort ? `Use at least ${MIN_PASSWORD} characters` : undefined}
      />

      {/*
        The second box, which the web has had all along and this did not.

        Typing a password you cannot see and getting one character wrong locks
        you out of the thing you were setting up, and you find out at the login
        screen rather than here. That is the whole reason the pattern exists,
        and it matters more on a phone keyboard than on a desktop one.
      */}
      <Input
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirmValue}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="Repeat password"
        error={mismatch ? 'Passwords do not match' : undefined}
        containerStyle={styles.gap}
      />

      <Button
        label="Save password"
        disabled={!canSave}
        loading={setPassword.isPending}
        onPress={() =>
          setPassword.mutate(password, {
            onSuccess: () => {
              setPasswordValue('');
              setConfirmValue('');
              /*
                Says what the password is FOR. "Password saved" leaves somebody
                who has only ever used email links unsure whether anything about
                signing in has changed; the web spells out that email plus this
                password now works, and the link still does.
              */
              toast.success('Password saved. You can now sign in with your email and password.');
            },
            /*
              The server's own words when it has them. It refuses a password
              matching the current one with "New password must be different from
              the current one.", and answering that with a flat "could not save"
              turns a precise, actionable refusal into a mystery.
            */
            onError: (error) => {
              const body = error instanceof ApiError ? error.body : undefined;
              toast.error(
                isApiErrorBody(body) ? body.error : 'Could not save that password.',
              );
            },
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
            /*
              A 401 here is not a failure to sign out. It means the session was
              ALREADY revoked, so the only thing left to do is the local half,
              and reporting "could not sign out, please try again" is both wrong
              and a trap: this button is the escape hatch from a dead session,
              and it was refusing to work in exactly the state you would reach
              for it. Retrying could never succeed, because the request that
              would prove the session valid is the one being rejected.
            */
            onError: (error) => {
              if (error instanceof ApiError && error.status === 401) {
                void signOut();
                return;
              }
              toast.error('Could not sign out everywhere. Please try again.');
            },
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
