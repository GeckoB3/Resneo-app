import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { EventAttendees } from '@/components/events/EventAttendees';
import { EventCard } from '@/components/events/EventCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
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

type FilterTab = 'upcoming' | 'past';

/** How far ahead/back the two tabs look. */
const UPCOMING_DAYS = 365;
const PAST_DAYS = 90;

const WEB_EVENT_MANAGER_URL = 'https://app.resneo.com/dashboard/event-manager';

/** spacing.sm gap between event cards (the old contentContainer gap). */
function CardSeparator() {
  return <View style={styles.cardSeparator} />;
}

/**
 * Staff Events screen — upcoming ticketed events with tickets sold vs
 * capacity, plus a per-event attendee roster that taps through to the full
 * booking detail. Read + arrived-toggle only: the event-manager CRUD routes
 * (create/edit/delete/cancel) are cookie-only on the web app, so those
 * actions stay on the web dashboard (inline note below the list).
 */
export default function EventsScreen() {
  const queryClient = useQueryClient();
  const { venue } = useVenueContext();
  const venueId = venue?.id ?? null;

  const [filter, setFilter] = useState<FilterTab>('upcoming');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

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

  // Realtime refresh — same `bookings` table the web event-manager watches.
  const liveState = useVenueLiveSync({
    venueId,
    onRefresh,
    subscriptions: venueId ? [{ table: 'bookings', filter: `venue_id=eq.${venueId}` }] : [],
    enabled: !!venueId,
  });

  const openWebEventManager = useCallback(() => {
    void Linking.openURL(WEB_EVENT_MANAGER_URL);
  }, []);

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
          headerRight: () =>
            liveState !== 'idle' ? (
              <View style={styles.liveWrap}>
                <LiveDot state={liveState} />
              </View>
            ) : null,
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
                ? 'Active ticketed events will appear here with tickets sold and an attendee roster. Events are created on the web dashboard.'
                : `No events ran in the past ${PAST_DAYS} days.`
            }
            actionLabel="Open web event manager"
            onAction={openWebEventManager}
          />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={keyExtractor}
          renderItem={renderEvent}
          ItemSeparatorComponent={CardSeparator}
          ListFooterComponent={
            <>
              {/* Event CRUD is cookie-auth only on the web app — link out instead. */}
              <View style={styles.webNote}>
                <Text variant="caption" tone="muted" style={styles.webNoteText}>
                  Creating, editing, cancelling events and ticket setup are managed on the
                  web dashboard.
                </Text>
                <Button
                  label="Open web event manager"
                  size="sm"
                  variant="ghost"
                  onPress={openWebEventManager}
                />
              </View>
              <View style={styles.spacer} />
            </>
          }
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
  webNote: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  webNoteText: {
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
  liveWrap: {
    marginRight: spacing.sm,
  },
});
