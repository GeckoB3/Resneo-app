import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CustomerBookingRow } from '@/components/customer/CustomerBookingRow';
import { WaitlistSection } from '@/components/customer/WaitlistSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { groupCustomerBookings } from '@/lib/booking/customer-visit-list';
import { queryKeys } from '@/lib/queries/keys';
import { useCustomerBookings } from '@/lib/queries/useCustomerBookings';
import { useCustomerHome } from '@/lib/queries/useCustomerHome';
import { useFocusRefresh } from '@/lib/queries/useFocusRefresh';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type Filter = 'upcoming' | 'past';

/**
 * Everything the customer has booked, split by whether it has happened.
 *
 * The split is a filter over ONE list rather than two requests, because the
 * route returns the lot and the boundary is a date comparison. Two requests
 * would mean two ways to be half-loaded and a "past" tab that could disagree
 * with the "upcoming" one about the same booking.
 *
 * A multi-service visit is ONE card (web split-visit plan 6.8, G4): its rows
 * share a `visit_key` and collapse into the visit's earliest service, which
 * opens the whole visit. The list is asked again whenever the tab is shown and
 * on pull-to-refresh (G27).
 */
export default function CustomerBookingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const { data, isLoading, isError, refetch } = useCustomerBookings();
  // Venue names live on the hub aggregate; this list carries ids only.
  const { data: home } = useCustomerHome();

  const refresh = useCallback(
    () =>
      Promise.all(
        (['bookings', 'home', 'waitlist'] as const).map((part) =>
          queryClient.invalidateQueries({ queryKey: [...queryKeys.customer.all(), part] }),
        ),
      ),
    [queryClient],
  );
  const { refreshing, onRefresh } = useFocusRefresh(refresh);

  const items = useMemo(() => {
    const all = data?.bookings ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = all.filter((b) => b.booking_date >= today);
    const past = all.filter((b) => b.booking_date < today);
    // Soonest first when looking forward, most recent first when looking back:
    // in both cases the nearest thing to now is at the top.
    const rows =
      filter === 'upcoming'
        ? upcoming.sort((a, b) => byDateTime(a, b))
        : past.sort((a, b) => byDateTime(b, a));
    return groupCustomerBookings(rows);
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
    <Screen
      scroll
      padded
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
      }>
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
        {items.length === 0 ? (
          <EmptyState
            title={filter === 'upcoming' ? 'Nothing coming up' : 'Nothing yet'}
            message={
              filter === 'upcoming'
                ? 'When you book with a venue that uses ResNeo, it will show up here.'
                : 'Bookings you have already been to will appear here.'
            }
          />
        ) : (
          items.map((item) =>
            item.kind === 'visit' ? (
              <CustomerBookingRow
                key={`visit-${item.visitKey}`}
                booking={item.first}
                visitRows={item.rows}
                home={home}
                onPress={() => router.push(`/booking/${item.first.id}`)}
              />
            ) : (
              <CustomerBookingRow
                key={item.booking.id}
                booking={item.booking}
                home={home}
                onPress={() => router.push(`/booking/${item.booking.id}`)}
              />
            ),
          )
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
