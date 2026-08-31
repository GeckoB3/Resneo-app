import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { formatPence } from '@/lib/format';
import { useCustomerPayments } from '@/lib/queries/useCustomerAccount';
import { useCustomerHome, venueNameFor } from '@/lib/queries/useCustomerHome';
import { expiryPhrase } from '@/components/customer/passes/passes-copy';
import { spacing } from '@/theme/index';

/**
 * What the customer has paid, and to whom.
 *
 * A FAILED read says so rather than rendering an empty list. This is money: a
 * customer told they have paid nothing, who has in fact paid, will ring the
 * venue, and the venue will have no idea why. The web made the same call for
 * the same reason.
 */
export function PaymentHistorySection() {
  const { data, isLoading, isError, refetch } = useCustomerPayments();
  const { data: home } = useCustomerHome();

  if (isLoading) return <LoadingState message="Loading your payments…" />;

  if (isError) {
    return (
      <Card>
        <Text variant="overline" tone="secondary">
          PAYMENTS
        </Text>
        <ErrorState
          message="We could not load your payments just now, so this list may be incomplete."
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const payments = data?.payments ?? [];

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        PAYMENTS
      </Text>
      {payments.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          Nothing paid through ResNeo yet. Payments you make to a venue will be listed here.
        </Text>
      ) : (
        payments.map((payment) => (
          <View key={payment.id} style={styles.row}>
            <View style={styles.main}>
              <Text variant="body">{venueNameFor(home, payment.venue_id)}</Text>
              <Text variant="caption" tone="muted">
                {expiryPhrase(payment.created_at)}
                {payment.purpose ? ` · ${payment.purpose.replace(/_/g, ' ')}` : ''}
              </Text>
            </View>
            <Text variant="body">{formatPence(payment.amount_pence)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  main: { flex: 1, gap: 2 },
  gap: { marginTop: spacing.sm },
});
