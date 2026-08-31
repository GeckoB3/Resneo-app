import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { nameById } from '@/components/customer/passes/lookup';
import {
  recurringCancelConsequence,
  recurringLine,
} from '@/components/customer/passes/passes-copy';
import {
  useCancelRecurring,
  useRecurring,
  type RecurringReservation,
} from '@/lib/queries/useCustomerPasses';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/** Statuses that mean the standing rule is still producing bookings. */
const LIVE = new Set(['active', 'scheduled']);

/**
 * Standing weekly reservations: the same class, every Tuesday.
 *
 * Stoppable since C7. It shipped read-only in C3 because a control that ends a
 * standing rule has to say what happens to the bookings the rule has already
 * made, and that answer had not been established. It has now: the route deletes
 * the rule row and nothing else, so classes already booked stay booked and the
 * copy says so.
 */
export function RecurringSection() {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useRecurring();
  const cancel = useCancelRecurring();
  const [pending, setPending] = useState<RecurringReservation | null>(null);

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
          <Button
            label="Stop booking this weekly"
            variant="secondary"
            onPress={() => setPending(reservation)}
            style={styles.gap}
          />
        </Card>
      ))}

      <ConfirmSheet
        visible={pending !== null}
        title="Stop this weekly booking?"
        message={recurringCancelConsequence()}
        confirmLabel="Stop booking it"
        cancelLabel="Keep it"
        loading={cancel.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => {
          // Read into a local first: the sheet clears its own state on confirm,
          // so `pending` is gone by the time the request would be built.
          const target = pending;
          setPending(null);
          if (!target) return;
          cancel.mutate(target.id, {
            onSuccess: () => toast.success('No new classes will be booked for you.'),
            onError: () => toast.error('Could not stop that. Please ring the venue.'),
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  gap: { marginTop: spacing.sm },
});
