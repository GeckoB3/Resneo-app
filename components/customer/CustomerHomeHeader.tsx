import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useAppMode } from '@/lib/mode/useAppMode';
import { useCustomerProfile } from '@/lib/queries/useCustomerProfile';
import type { CustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';
import { Button } from '@/components/ui/Button';

type Props = { home: CustomerHome };

/**
 * The hub's greeting, and the way back to the venue app for anyone who has one.
 *
 * The switcher lives here rather than in a tab bar or a settings screen because
 * a dual-role person needs it on arrival: they have just been routed somewhere
 * by a preference, and if the preference was wrong the fix should be the first
 * thing they can reach, not something to go hunting for.
 */
export function CustomerHomeHeader({ home }: Props) {
  const { canSwitch, choose } = useAppMode();
  const profileQuery = useCustomerProfile();

  const firstName = profileQuery.data?.profile?.first_name?.trim();
  const greeting = firstName ? `Hello, ${firstName}` : 'Your bookings';

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.titleCol}>
          <Text variant="heading">{greeting}</Text>
          <Text variant="bodySmall" tone="secondary">
            {summaryLine(home)}
          </Text>
        </View>
      </View>
      {canSwitch ? (
        /*
          Only shown to somebody who actually has a venue to go back to. A
          confirmed customer has no staff side, and offering them a door to a
          place they cannot enter is worse than offering nothing.
        */
        <Button
          label="Switch to venue app"
          variant="secondary"
          onPress={() => choose('staff')}
        />
      ) : null}
    </View>
  );
}

/**
 * One line saying what is coming, or honestly saying nothing is.
 *
 * Deliberately not "You have 0 bookings": a count of nothing reads as a system
 * report rather than an answer, and the empty case is the first thing most new
 * customers will see.
 */
function summaryLine(home: CustomerHome): string {
  if (home.upcoming_count === 0) {
    return 'Nothing booked at the moment.';
  }
  if (home.upcoming_count === 1) {
    return 'One booking coming up.';
  }
  return `${home.upcoming_count} bookings coming up.`;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  titleCol: { flex: 1, gap: spacing.xs },
});
