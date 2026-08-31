import { StyleSheet, View } from 'react-native';

import { CustomerHomeHeader } from '@/components/customer/CustomerHomeHeader';
import { NextBookingCard } from '@/components/customer/NextBookingCard';
import { OutstandingPaymentsCard } from '@/components/customer/OutstandingPaymentsCard';
import { PassesSummaryCard } from '@/components/customer/PassesSummaryCard';
import { UpcomingList } from '@/components/customer/UpcomingList';
import { VenueHistorySection } from '@/components/customer/VenueHistorySection';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { useCustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

/**
 * The customer hub.
 *
 * One request, `GET /api/v1/me/home`, which the web already shaped as a single
 * aggregate for exactly this reason: the hub is the screen a customer opens to
 * answer "what is next and do I owe anything", and answering it from five
 * requests would mean five ways to be half-loaded.
 */
export default function CustomerHomeScreen() {
  const { data, isLoading, isError, refetch } = useCustomerHome();

  if (isLoading) {
    return <LoadingState message="Loading your bookings…" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load your account"
        message="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <Screen scroll padded>
      <View style={styles.stack}>
        <CustomerHomeHeader home={data} />
        <NextBookingCard home={data} />
        <OutstandingPaymentsCard home={data} />
        <UpcomingList home={data} />
        <PassesSummaryCard home={data} />
        {/* Last, and the reason an empty hub is not a dead end: a customer with
            nothing booked usually still has venues to go back to. */}
        <VenueHistorySection home={data} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
});
