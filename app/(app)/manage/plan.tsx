import { Stack } from 'expo-router';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { getApiUrl } from '@/lib/env';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import type { BookingModel } from '@/types/venue';

const MODEL_LABELS: Record<BookingModel, string> = {
  table_reservation: 'Tables',
  practitioner_appointment: 'Appointments',
  unified_scheduling: 'Appointments',
  event_ticket: 'Events',
  class_session: 'Classes',
  resource_booking: 'Resources',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Plan & payments overview — billing changes and Stripe Connect happen on web. */
export default function PlanScreen() {
  const { venue, isLoading } = useVenueContext();

  const openWeb = (path: string) => {
    const url = `${getApiUrl()}${path}`;
    void Linking.openURL(url).catch(() => Alert.alert('Could not open browser', url));
  };

  const header = <Stack.Screen options={{ title: 'Plan & payments' }} />;

  if (isLoading || !venue) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }

  const models = Array.from(
    new Set(
      [venue.booking_model, ...(venue.active_booking_models ?? []), ...(venue.enabled_models ?? [])]
        .filter(Boolean)
        .map((m) => MODEL_LABELS[m as BookingModel] ?? m),
    ),
  );
  const stripeConnected = !!venue.stripe_connected_account_id;

  return (
    <Screen scroll={false} padded={false}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text variant="label">Plan</Text>
          <View style={styles.rows}>
            <InfoRow label="Tier" value={venue.pricing_tier ?? '—'} />
            <InfoRow label="Booking types" value={models.join(' · ') || '—'} />
            <InfoRow label="Currency" value={venue.currency?.toUpperCase() ?? 'GBP'} />
          </View>
          <Button
            label="Manage plan on web"
            variant="secondary"
            fullWidth
            onPress={() => openWeb('/dashboard/settings')}
          />
        </Card>

        <Card>
          <View style={styles.paymentsHeader}>
            <Text variant="label">Payments</Text>
            <Badge
              label={stripeConnected ? 'Stripe connected' : 'Not connected'}
              tone={stripeConnected ? 'success' : 'warning'}
            />
          </View>
          <Text variant="bodySmall" tone="secondary" style={styles.help}>
            {stripeConnected
              ? 'Online deposits and payments are enabled via Stripe.'
              : 'Connect Stripe on the web dashboard to take online deposits and payments.'}
          </Text>
          <Button
            label={stripeConnected ? 'Manage Stripe on web' : 'Connect Stripe on web'}
            variant="secondary"
            fullWidth
            onPress={() => openWeb('/dashboard/settings')}
          />
        </Card>
        <View style={styles.spacer} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  rows: {
    marginVertical: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  paymentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  help: {
    marginVertical: spacing.sm,
  },
  spacer: {
    height: spacing.xl,
  },
});
