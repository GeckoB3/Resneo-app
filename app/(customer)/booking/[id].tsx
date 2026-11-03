import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { BookingActions } from '@/components/customer/BookingActions';
import { BookingDetailBody } from '@/components/customer/BookingDetailBody';
import { RescheduleSheet } from '@/components/customer/RescheduleSheet';
import { VisitActions } from '@/components/customer/VisitActions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useCustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import { useCustomerVisit } from '@/lib/queries/useCustomerVisit';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * One booking, in full.
 *
 * The body is `GET /api/v1/me/bookings/[id]`, which returns the SHARED booking
 * DTO: the same object the web's own detail page renders. That is why this
 * screen is a rendering job rather than a second interpretation of a booking,
 * and why a field the web adds arrives here without a second design decision.
 *
 * A booking that is one service of a multi-service visit (`in_visit`) shows the
 * whole visit instead, and acts on it whole (web split-visit plan 6.5 to 6.7,
 * 8.9), as the web's manage page does through `GuestVisitPanel`. That holds
 * for a service the business has since cancelled: a universal link or a push
 * for it still opens the visit, rather than a cancelled booking with nothing to
 * do (G5).
 */
export default function CustomerBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [rescheduling, setRescheduling] = useState(false);
  const { data, isLoading, isError, refetch } = useCustomerBookingDetail(id);
  const inVisit = data?.in_visit === true;
  const visitQuery = useCustomerVisit(id, inVisit);
  const refetchVisit = visitQuery.refetch;
  // A visit of one service is just a booking: today's screen, unchanged.
  const visit = visitQuery.data?.multi_service ? visitQuery.data : null;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([refetch(), inVisit ? refetchVisit() : null])
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [refetch, refetchVisit, inVisit]);

  if (isLoading || (inVisit && visitQuery.isLoading)) return <LoadingState message="Loading your booking…" />;

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load this booking"
        message="It may have been removed, or your connection dropped."
        onRetry={() => void refetch()}
      />
    );
  }

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
  );

  if (inVisit && visit) {
    return (
      <Screen scroll padded refreshControl={refreshControl}>
        <Stack.Screen options={{ title: 'Your visit' }} />
        <View style={styles.stack}>
          <BookingDetailBody booking={data} visit={visit} />
          <VisitActions bookingId={data.booking_id} visit={visit} />
        </View>
      </Screen>
    );
  }

  if (inVisit && visitQuery.isError) {
    /*
      The visit could not be read. Offering this one service's change or
      cancel instead would act on part of a visit (the server refuses the
      change, and a cancel takes every service with it), so nothing is offered
      until the visit loads.
    */
    return (
      <Screen scroll padded refreshControl={refreshControl}>
        <View style={styles.stack}>
          <BookingDetailBody booking={data} />
          <Card>
            <Text variant="body">
              This booking is part of a visit with more than one service, and we could not load the rest of it.
            </Text>
            <Button
              label="Try again"
              variant="secondary"
              loading={visitQuery.isFetching}
              onPress={() => void refetchVisit()}
              style={styles.gap}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll padded refreshControl={refreshControl}>
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
  gap: { marginTop: spacing.sm },
});
