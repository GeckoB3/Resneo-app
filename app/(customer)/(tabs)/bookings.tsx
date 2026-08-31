import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CustomerBookingRow } from '@/components/customer/CustomerBookingRow';
import { WaitlistSection } from '@/components/customer/WaitlistSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { useCustomerBookings } from '@/lib/queries/useCustomerBookings';
import { useCustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

type Filter = 'upcoming' | 'past';

/**
 * Everything the customer has booked, split by whether it has happened.
 *
 * The split is a filter over ONE list rather than two requests, because the
 * route returns the lot and the boundary is a date comparison. Two requests
 * would mean two ways to be half-loaded and a "past" tab that could disagree
 * with the "upcoming" one about the same booking.
 */
export default function CustomerBookingsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const { data, isLoading, isError, refetch } = useCustomerBookings();
  // Venue names live on the hub aggregate; this list carries ids only.
  const { data: home } = useCustomerHome();

  const rows = useMemo(() => {
    const all = data?.bookings ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = all.filter((b) => b.booking_date >= today);
    const past = all.filter((b) => b.booking_date < today);
    // Soonest first when looking forward, most recent first when looking back:
    // in both cases the nearest thing to now is at the top.
    return filter === 'upcoming'
      ? upcoming.sort((a, b) => byDateTime(a, b))
      : past.sort((a, b) => byDateTime(b, a));
  }, [data, filter]);

  if (isLoading) return <LoadingState message="Loading your bookings…" />;

  if (isError) {
    return (
      <ErrorState
        title="Could not load your bookings"
        message="Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <Screen scroll padded>
      {/* Above the filter, because an offered place expires and burying it
          under a list of confirmed bookings is how somebody misses it. */}
      <WaitlistSection home={home} />
      <Segmented
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
      />
      <View style={styles.list}>
        {rows.length === 0 ? (
          <EmptyState
            title={filter === 'upcoming' ? 'Nothing coming up' : 'Nothing yet'}
            message={
              filter === 'upcoming'
                ? 'When you book with a venue that uses ResNeo, it will show up here.'
                : 'Bookings you have already been to will appear here.'
            }
          />
        ) : (
          rows.map((booking) => (
            <CustomerBookingRow
              key={booking.id}
              booking={booking}
              home={home}
              onPress={() => router.push(`/booking/${booking.id}`)}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

function byDateTime(
  a: { booking_date: string; booking_time: string },
  b: { booking_date: string; booking_time: string },
): number {
  return `${a.booking_date}T${a.booking_time}`.localeCompare(`${b.booking_date}T${b.booking_time}`);
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.base, gap: spacing.sm },
});
