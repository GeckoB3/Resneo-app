import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Shown when the user is signed in to Supabase but is not venue staff.
 * Phase 2+ will refine messaging once staff/me and venue bootstrap are reliable.
 */
export default function StaffRequiredScreen() {
  const { colors } = useTheme();
  const { user, signOut } = useAuth();

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: colors.text }]}>Staff access required</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {user?.email
          ? `${user.email} is signed in, but this app is only for Resneo venue staff.`
          : 'This app is only for Resneo venue staff.'}
      </Text>

      <Card style={styles.card}>
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
          Ask your venue admin to invite you as staff, or sign in with a different email. Customer
          accounts use the Resneo website instead.
        </Text>
      </Card>

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
    ...typography.title,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.xl,
  },
  cardBody: {
    ...typography.bodySmall,
  },
  action: {
    marginTop: spacing.base,
  },
});
