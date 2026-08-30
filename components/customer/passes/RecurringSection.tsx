import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { nameById } from '@/components/customer/passes/lookup';
import { recurringLine } from '@/components/customer/passes/passes-copy';
import { useRecurring } from '@/lib/queries/useCustomerPasses';
import { spacing } from '@/theme/index';

/** Statuses that mean the standing rule is still producing bookings. */
const LIVE = new Set(['active', 'scheduled']);

/**
 * Standing weekly reservations: the same class, every Tuesday.
 *
 * READ ONLY here, deliberately. The web offers cancelling one, through
 * `DELETE /api/account/class-recurring/[id]`, and that is a real gap rather
 * than a finished surface. It is recorded in the plan instead of being
 * half-built: a control that cancels a standing rule needs to say what happens
 * to the bookings it has already created, and answering that properly is more
 * than a button.
 */
export function RecurringSection() {
  const { data, isLoading, isError, refetch } = useRecurring();

  if (isLoading) return <LoadingState message="Loading your weekly classes…" />;
  if (isError) {
    return (
      <ErrorState message="Could not load your weekly classes." onRetry={() => void refetch()} />
    );
  }

  const live = (data?.reservations ?? []).filter((r) => LIVE.has(r.status));

  if (live.length === 0) {
    return (
      <EmptyState
        title="No weekly classes"
        message="If a venue books you into the same class each week, it will show up here."
      />
    );
  }

  return (
    <View style={styles.list}>
      {live.map((reservation) => (
        <Card key={reservation.id}>
          <Text variant="bodyMedium">
            {nameById(data?.class_types, reservation.class_type_id, 'Class')}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {nameById(data?.venues, reservation.venue_id)}
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.gap}>
            {recurringLine(reservation.day_of_week, reservation.start_time)}
          </Text>
          <Text variant="caption" tone="muted" style={styles.gap}>
            To change or stop this, please speak to the venue.
          </Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  gap: { marginTop: spacing.sm },
});
