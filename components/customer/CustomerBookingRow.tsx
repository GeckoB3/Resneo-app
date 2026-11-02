import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { customerBookingState } from '@/lib/booking/customer-booking-state';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { balancePenceFor, venueNameFor, type CustomerBooking, type CustomerHome } from '@/lib/queries/useCustomerHome';
import { formatPence } from '@/lib/format';
import { spacing } from '@/theme/index';

type Props = {
  booking: CustomerBooking;
  home: CustomerHome | undefined;
  onPress: () => void;
};

/**
 * One booking in the list.
 *
 * Shows the venue rather than the service, because the list carries booking
 * rows and the service name lives on the detail payload. Naming the venue is
 * both true and the thing a customer scanning a list is actually looking for.
 */
export function CustomerBookingRow({ booking, home, onPress }: Props) {
  const owed = balancePenceFor(booking);
  const cancelled = isCancelled(booking.status);

  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text variant="bodyMedium">{venueNameFor(home, booking.venue_id)}</Text>
          <Text variant="bodySmall" tone="secondary">
            {formatDayHeading(booking.booking_date)} at {booking.booking_time.slice(0, 5)}
          </Text>
        </View>
        <View style={styles.meta}>
          {cancelled ? (
            <Text variant="caption" tone="muted">
              Cancelled
            </Text>
          ) : owed ? (
            /*
              The amount, not just a flag. "Payment due" tells somebody to worry
              without telling them how much, which is the version that generates
              a phone call to the venue.
            */
            <Text variant="caption" tone="secondary">
              {formatPence(owed)} to pay
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/** Cancelled or missed: the row is struck through and owes nothing. */
function isCancelled(status: string): boolean {
  const state = customerBookingState(status);
  return state === 'cancelled' || state === 'missed';
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  main: { flex: 1, gap: 2 },
  meta: { alignItems: 'flex-end' },
});
