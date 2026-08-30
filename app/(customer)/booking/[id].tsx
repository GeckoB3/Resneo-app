import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BookingActions } from '@/components/customer/BookingActions';
import { BookingDetailBody } from '@/components/customer/BookingDetailBody';
import { RescheduleSheet } from '@/components/customer/RescheduleSheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { useCustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import { spacing } from '@/theme/index';

/**
 * One booking, in full.
 *
 * The body is `GET /api/v1/me/bookings/[id]`, which returns the SHARED booking
 * DTO: the same object the web's own detail page renders. That is why this
 * screen is a rendering job rather than a second interpretation of a booking,
 * and why a field the web adds arrives here without a second design decision.
 */
export default function CustomerBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [rescheduling, setRescheduling] = useState(false);
  const { data, isLoading, isError, refetch } = useCustomerBookingDetail(id);

  if (isLoading) return <LoadingState message="Loading your booking…" />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load this booking"
        message="It may have been removed, or your connection dropped."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <Screen scroll padded>
      <View style={styles.stack}>
        <BookingDetailBody booking={data} />
        <BookingActions
          booking={data}
          onReschedule={() => setRescheduling(true)}
          onCancelled={() => router.back()}
        />
      </View>
      <RescheduleSheet
        booking={data}
        visible={rescheduling}
        onClose={() => setRescheduling(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
});
