import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatShortDayLabel } from '@/lib/dates/venue-dates';
import { venueNameFor, type CustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

type Props = { home: CustomerHome };

/**
 * The bookings after the next one.
 *
 * A LIST rather than a count, which is a lesson the web already learned: it
 * used to say "you have 4 upcoming bookings" and link away, so a customer with
 * four appointments that week learned only the number. These rows cost nothing
 * extra, because the aggregate already carries them.
 */
export function UpcomingList({ home }: Props) {
  if (home.upcoming_after_next.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        ALSO COMING UP
      </Text>
      {home.upcoming_after_next.map((booking) => (
        <View key={booking.id} style={styles.row}>
          <Text variant="body" style={styles.when}>
            {formatShortDayLabel(booking.booking_date)}
          </Text>
          <Text variant="body" tone="secondary" style={styles.venue}>
            {venueNameFor(home, booking.venue_id)}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {booking.booking_time.slice(0, 5)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  when: { minWidth: 64 },
  venue: { flex: 1 },
});
