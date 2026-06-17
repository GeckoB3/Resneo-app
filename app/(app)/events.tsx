import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { EventAttendees } from '@/components/events/EventAttendees';
import { EventCard } from '@/components/events/EventCard';
import { EventManagerSheet } from '@/components/events/EventManagerSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import {
  experienceEventKeys,
  useExperienceEvents,
  type ExperienceEventSummary,
} from '@/lib/queries/useExperienceEvents';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type FilterTab = 'upcoming' | 'past';

/** How far ahead/back the two tabs look. */
const UPCOMING_DAYS = 365;
const PAST_DAYS = 90;

/** spacing.sm gap between event cards (the old contentContainer gap). */
function CardSeparator() {
  return <View style={styles.cardSeparator} />;
}

/**
 * Staff Events screen — ticketed events with tickets sold vs capacity, plus a
 * per-event attendee roster that taps through to the full booking detail and an
 * Arrived toggle. Event setup (create/edit/delete, ticket tiers, admin cancel)
 * is available in-app via the {@link EventManagerSheet} (header action) — the
 * experience-events routes are Bearer-capable.
 */
export default function EventsScreen() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const venueId = venue?.id ?? null;

  const [filter, setFilter] = useState<FilterTab>('upcoming');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const today = calendarDateInTimeZone(new Date(), venue?.timezone);
  const range = useMemo(
    () =>
      filter === 'upcoming'
        ? { from: today, to: addDaysToDateStr(today, UPCOMING_DAYS) }
        : { from: addDaysToDateStr(today, -PAST_DAYS), to: addDaysToDateStr(today, -1) },
    [filter, today],
  );

  const query = useExperienceEvents(range);

  const events = useMemo(() => {
    const list = query.data ?? [];
    // Upcoming reads soonest-first; past reads most-recent-first.
    return filter === 'past' ? [...list].reverse() : list;
  }, [query.data, filter]);

  const onRefresh = useCallback(() => {
    void query.refetch();
    // Refresh any open roster too (it has its own query key).
    void queryClient.invalidateQueries({ queryKey: experienceEventKeys.attendeesAll() });
  }, [query, queryClient]);

  // Realtime refresh — the same two tables the web event-manager watches:
  // `experience_events` (event CRUD) and `bookings` (ticket sales / arrivals).
  const liveState = useVenueLiveSync({
    venueId,
    onRefresh,
    subscriptions: venueId
      ? [
          { table: 'experience_events', filter: `venue_id=eq.${venueId}` },
          { table: 'bookings', filter: `venue_id=eq.${venueId}` },
        ]
      : [],
    enabled: !!venueId,
  });

  const keyExtractor = useCallback((event: ExperienceEventSummary) => event.id, []);

  const renderEvent: ListRenderItem<ExperienceEventSummary> = ({ item }) => (
    <EventCard
      event={item}
      today={today}
      expanded={expandedId === item.id}
      onToggle={() => setExpandedId((current) => (current === item.id ? null : item.id))}>
      <EventAttendees
        eventId={item.id}
        eventName={item.name}
        eventDate={item.date}
        onOpenBooking={setDetailBookingId}
      />
    </EventCard>
  );

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen
        options={{
          title: 'Events',
          headerRight: () => (
            <View style={styles.headerActions}>
              {liveState !== 'idle' ? <LiveDot state={liveState} /> : null}
              <IconButton
                icon={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
                accessibilityLabel="Manage events"
                tint={colors.brand}
                iconSize={22}
                onPress={() => setManagerOpen(true)}
              />
            </View>
          ),
        }}
      />

      <View style={styles.filterBar}>
        <Segmented<FilterTab>
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: `Past ${PAST_DAYS} days` },
          ]}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setExpandedId(null);
          }}
        />
      </View>

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : 'Could not load events.'
            }
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.stateWrap}>
          <EmptyState
            title={filter === 'upcoming' ? 'No upcoming events' : 'No recent events'}
            message={
              filter === 'upcoming'
                ? 'Ticketed events appear here with tickets sold and an attendee roster. Create your first event to get started.'
                : `No events ran in the past ${PAST_DAYS} days.`
            }
            actionLabel={filter === 'upcoming' ? 'New event' : undefined}
            onAction={filter === 'upcoming' ? () => setManagerOpen(true) : undefined}
          />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={keyExtractor}
          renderItem={renderEvent}
          ItemSeparatorComponent={CardSeparator}
          ListFooterComponent={<View style={styles.spacer} />}
          contentContainerStyle={styles.content}
          initialNumToRender={8}
          windowSize={11}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={onRefresh} />
          }
        />
      )}

      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />

      <EventManagerSheet visible={managerOpen} onClose={() => setManagerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  content: {
    padding: spacing.base,
  },
  cardSeparator: {
    height: spacing.sm,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing.xl,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
});
