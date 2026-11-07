import { Linking, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/index';

export const SUPPORT_EMAIL = 'support@resneo.com';

type AccountSuspendedProps = {
  venueName?: string | null;
  /** Check again: ResNeo may have lifted the suspension. */
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Shown instead of the app when ResNeo has suspended the venue's account (web Super console,
 * Compliance tab; `account_suspended` on GET /api/venue). Every change would be refused with 403
 * `VENUE_SUSPENDED`, so the screens are not offered. A terminal state, rendered INLINE by the (app)
 * gate like <StaffRequired/>. It never says why: that stays between ResNeo and the owner.
 */
export function AccountSuspended({ venueName, onRetry, retrying = false }: AccountSuspendedProps) {
  const { signOut } = useAuth();

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        Account suspended
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {venueName
          ? `ResNeo has suspended the account for ${venueName}.`
          : 'ResNeo has suspended this account.'}
      </Text>

      <Card style={styles.card}>
        <Text variant="bodySmall" tone="secondary">
          While it is suspended, changes are turned off, the booking page is offline, messages to clients are paused and
          card payments are switched off. If you think this is a mistake, email {SUPPORT_EMAIL} and we will look at it
          straight away.
        </Text>
      </Card>

      <Button
        label="Email support"
        style={styles.action}
        onPress={() => {
          void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined);
        }}
      />

      {onRetry ? (
        <Button
          label={retrying ? 'Checking…' : 'Check again'}
          variant="secondary"
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
