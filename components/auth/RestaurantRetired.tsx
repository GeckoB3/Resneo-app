import { Linking, StyleSheet } from 'react-native';

import { SUPPORT_EMAIL } from '@/components/auth/AccountSuspended';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { RESTAURANT_RETIRED_STAFF_MESSAGE } from '@/lib/venue/restaurant-retired';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/index';

/**
 * Shown instead of the app when the venue is still set up for the retired restaurant product
 * (table bookings, retired 27 November 2026). The web dashboard shows the same message. A terminal
 * state, rendered INLINE by the (app) gate like <AccountSuspended/>.
 */
export function RestaurantRetired({ venueName }: { venueName?: string | null }) {
  const { signOut } = useAuth();

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        {venueName ?? 'Your business'}
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {RESTAURANT_RETIRED_STAFF_MESSAGE}
      </Text>

      <Button
        label="Email support"
        style={styles.action}
        onPress={() => {
          void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => undefined);
        }}
      />

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
  action: {
    marginTop: spacing.base,
  },
});
