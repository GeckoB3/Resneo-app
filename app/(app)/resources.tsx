import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { ResourceDaySection } from '@/components/resources/ResourceDaySection';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import {
  useResourceDayBookings,
  useResourcesList,
  type ResourceDayBookingRow,
} from '@/lib/queries/useResources';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Resources day view — per resource, the selected day's bookings (time,
 * guest, status) with prev/today/next date navigation. Tapping a booking
 * opens the shared {@link BookingDetailSheet}.
 *
 * Mirrors the web /dashboard/resource-timeline "Bookings" panel for staff
 * daily work. Resource setup (create/edit, pricing, weekly hours, exceptions)
 * stays on the web dashboard — those API routes are cookie-only.
 */
export default function ResourcesScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const venueId = venue?.id ?? null;
  const timeZone = venue?.timezone ?? undefined;

  const today = calendarDateInTimeZone(new Date(), timeZone);
  const [date, setDate] = useState(today);
  const [resourceFilter, setResourceFilter] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const resourcesQuery = useResourcesList();
  const bookingsQuery = useResourceDayBookings(date);

  // Realtime refresh — same tables the web page watches (30s polling fallback).
  const onLiveRefresh = useCallback(() => {
    void resourcesQuery.refetch();
    void bookingsQuery.refetch();
  }, [resourcesQuery, bookingsQuery]);

  const liveState = useVenueLiveSync({
    venueId,
    onRefresh: onLiveRefresh,
    subscriptions: venueId
      ? [
          { table: 'bookings', filter: `venue_id=eq.${venueId}` },
          { table: 'unified_calendars', filter: `venue_id=eq.${venueId}` },
        ]
      : [],
    enabled: !!venueId,
  });

  const resources = useMemo(() => resourcesQuery.data ?? [], [resourcesQuery.data]);

  // Group the day's bookings by resource. Legacy resource bookings can carry
  // the resource id in calendar_id instead of resource_id (web parity filter).
  const bookingsByResource = useMemo(() => {
    const resourceIds = new Set(resources.map((r) => r.id));
    const map = new Map<string, ResourceDayBookingRow[]>();
    for (const row of bookingsQuery.data ?? []) {
      const key =
        row.resource_id && resourceIds.has(row.resource_id)
          ? row.resource_id
          : row.calendar_id && resourceIds.has(row.calendar_id)
            ? row.calendar_id
            : null;
      if (!key) continue;
      const list = map.get(key);
      if (list) {
        list.push(row);
      } else {
        map.set(key, [row]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.booking_time ?? '').localeCompare(b.booking_time ?? ''));
    }
    return map;
  }, [bookingsQuery.data, resources]);

  const displayedResources = resourceFilter
    ? resources.filter((r) => r.id === resourceFilter)
    : resources;

  const isToday = date === today;

  const refreshing = resourcesQuery.isRefetching || bookingsQuery.isRefetching;
  const onPullRefresh = useCallback(() => {
    void resourcesQuery.refetch();
    void bookingsQuery.refetch();
  }, [resourcesQuery, bookingsQuery]);

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen
        options={{
          title: 'Resources',
          headerRight: () =>
            liveState !== 'idle' ? (
              <View style={styles.liveWrap}>
                <LiveDot state={liveState} />
              </View>
            ) : null,
        }}
      />

      {resourcesQuery.isLoading ? (
        <ListSkeleton />
      ) : resourcesQuery.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              resourcesQuery.error instanceof ApiError
                ? resourcesQuery.error.message
                : 'Could not load resources.'
            }
            onRetry={() => void resourcesQuery.refetch()}
          />
        </View>
      ) : resources.length === 0 ? (
        <View style={styles.stateWrap}>
          <EmptyState
            title="No resources yet"
            message="Create courts, rooms, or equipment on the web dashboard (Resource timeline) and they'll appear here."
          />
        </View>
      ) : (
        <>
          {/* Date toolbar */}
          <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
            <View style={styles.dateNav}>
              <ChevButton dir="left" onPress={() => setDate((d) => addDaysToDateStr(d, -1))} />
              <Pressable
                onPress={() => setDate(today)}
                accessibilityRole="button"
                accessibilityHint="Jump to today"
                style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
                <Text variant="subheading" numberOfLines={1}>
                  {formatDayHeading(date)}
                </Text>
              </Pressable>
              {!isToday ? (
                <Pressable
                  onPress={() => setDate(today)}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to today"
                  style={({ pressed }) => [
                    styles.todayPill,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text variant="label" color={colors.brand}>
                    Today
                  </Text>
                </Pressable>
              ) : null}
              <ChevButton dir="right" onPress={() => setDate((d) => addDaysToDateStr(d, 1))} />
            </View>

            {/* Resource filter chips */}
            {resources.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                <Chip
                  label="All"
                  selected={resourceFilter === null}
                  onPress={() => setResourceFilter(null)}
                />
                {resources.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.name}
                    count={bookingsByResource.get(r.id)?.length ?? 0}
                    selected={resourceFilter === r.id}
                    onPress={() => setResourceFilter(resourceFilter === r.id ? null : r.id)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>

          {/* Day body */}
          {bookingsQuery.isLoading ? (
            <ListSkeleton />
          ) : bookingsQuery.isError ? (
            <View style={styles.stateWrap}>
              <ErrorState
                message={
                  bookingsQuery.error instanceof ApiError
                    ? bookingsQuery.error.message
                    : 'Could not load this day’s bookings.'
                }
                onRetry={() => void bookingsQuery.refetch()}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
              }>
              {displayedResources.map((resource) => (
                <ResourceDaySection
                  key={resource.id}
                  resource={resource}
                  bookings={bookingsByResource.get(resource.id) ?? []}
                  onPressBooking={setDetailBookingId}
                />
              ))}

              <Text variant="caption" tone="muted" style={styles.webNote}>
                Add or edit resources — pricing, weekly hours, exceptions and payments — on the
                web dashboard (Resource timeline).
              </Text>
              <View style={styles.spacer} />
            </ScrollView>
          )}
        </>
      )}

      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChevButton({ dir, onPress }: { dir: 'left' | 'right'; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? 'Previous day' : 'Next day'}
      hitSlop={8}
      style={({ pressed }) => [styles.chevButton, { opacity: pressed ? 0.45 : 1 }]}>
      <SymbolView
        name={
          dir === 'left'
            ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
            : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
        }
        tintColor={colors.text}
        size={22}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    padding: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateLabel: {
    flex: 1,
    alignItems: 'center',
  },
  todayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chevButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  webNote: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  liveWrap: {
    marginRight: spacing.sm,
  },
});
