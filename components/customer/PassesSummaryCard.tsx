import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { CustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

type Props = { home: CustomerHome };

/**
 * Credits and memberships, as a summary only.
 *
 * C1 shows what the customer holds without offering anything to do with it,
 * because the screens that manage passes arrive in C3 and a control that
 * navigates nowhere is worse than a plain statement. The counts come free with
 * the hub aggregate.
 */
export function PassesSummaryCard({ home }: Props) {
  const lines: string[] = [];

  if (home.credits.total_remaining > 0) {
    const n = home.credits.total_remaining;
    const venues = home.credits.venue_count;
    lines.push(
      venues > 1
        ? `${n} class credits across ${venues} venues`
        : `${n} class ${n === 1 ? 'credit' : 'credits'}`,
    );
  }

  if (home.memberships.active_count > 0) {
    const n = home.memberships.active_count;
    lines.push(n === 1 ? '1 active membership' : `${n} active memberships`);
  }

  if (home.memberships.cancelling_count > 0) {
    const n = home.memberships.cancelling_count;
    // Named separately from the active count, because "ending" is the fact a
    // customer would want to catch, and it is invisible inside a total.
    lines.push(n === 1 ? '1 membership ending soon' : `${n} memberships ending soon`);
  }

  if (lines.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        YOUR PASSES
      </Text>
      {lines.map((line) => (
        <View key={line} style={styles.row}>
          <Text variant="body">{line}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.sm },
});
