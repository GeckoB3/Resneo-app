import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/index';

type StaffRequiredProps = {
  /** Refetch the staff profile — useful when the 401 was transient (e.g. the
   * venue API was mid-deploy). */
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Shown when the user is signed in to Supabase but `staff/me` says they are not
 * venue staff (a 401). Rendered INLINE by the (app) gate — never via a redirect
 * into the gated stack, which would loop.
 */
export function StaffRequired({ onRetry, retrying = false }: StaffRequiredProps) {
  const { user, signOut } = useAuth();

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        Staff access required
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {user?.email
          ? `${user.email} is signed in, but this app is only for Resneo venue staff.`
          : 'This app is only for Resneo venue staff.'}
      </Text>

      <Card style={styles.card}>
        <Text variant="bodySmall" tone="secondary">
          Ask your venue admin to invite you as staff, or sign in with a different email. Customer
          accounts use the Resneo website instead.
        </Text>
      </Card>

      {onRetry ? (
        <Button
          label={retrying ? 'Checking…' : 'Try again'}
          loading={retrying}
          style={styles.action}
          onPress={onRetry}
        />
      ) : null}

      <Button
        label="Sign out"
        variant="secondary"
        style={styles.action}
        onPress={() => {
          void signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.xl,
  },
  action: {
    marginTop: spacing.base,
  },
});
