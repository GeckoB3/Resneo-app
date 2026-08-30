import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { balancePenceFor, venueNameFor, type CustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

type Props = { home: CustomerHome };

/**
 * What is still owed, on bookings that have not happened yet.
 *
 * The web deliberately sends upcoming bookings only: a past booking with a
 * balance is settled with the venue directly, and neither the portal nor this
 * app can take payment for one, so listing it would be an anxiety line with no
 * action attached. That reasoning holds here and the list is rendered as sent.
 *
 * The amount comes from `balancePenceFor` rather than `payment_state`, because
 * a free booking is `unpaid` with nothing owing and would otherwise appear here
 * asking the customer for zero pounds.
 */
export function OutstandingPaymentsCard({ home }: Props) {
  const owing = home.outstanding_payments
    .map((b) => ({ booking: b, pence: balancePenceFor(b) }))
    .filter((row): row is { booking: (typeof home.outstanding_payments)[number]; pence: number } =>
      row.pence !== null,
    );

  if (owing.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        STILL TO PAY
      </Text>
      {owing.map(({ booking, pence }) => (
        <View key={booking.id} style={styles.row}>
          <Text variant="body" style={styles.name}>
            {venueNameFor(home, booking.venue_id)}
          </Text>
          <Text variant="body">{formatPence(pence)}</Text>
        </View>
      ))}
      <Text variant="bodySmall" tone="secondary" style={styles.note}>
        You can settle this with the venue when you arrive.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  name: { flex: 1 },
  note: { marginTop: spacing.sm },
});
