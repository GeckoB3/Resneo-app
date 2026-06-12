import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { ClassRosterView } from '@/components/classes/ClassRosterView';
import { ClassSessionCard } from '@/components/classes/ClassSessionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  addDaysToDateStr,
  calendarDateInTimeZone,
  formatDayHeading,
  formatRangeLabel,
  getWeekRangeFromDate,
} from '@/lib/dates/venue-dates';
import { queryKeys } from '@/lib/queries/keys';
import { useClassSessions, type ClassSession } from '@/lib/queries/useClassSchedule';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Sessions grouped by calendar date, in feed order (soonest first). */
function groupByDate(sessions: ClassSession[]): { date: string; items: ClassSession[] }[] {
  const groups: { date: string; items: ClassSession[] }[] = [];
  for (const session of sessions) {
    const tail = groups[groups.length - 1];
    if (!tail || tail.date !== session.date) {
      groups.push({ date: session.date, items: [session] });
    } else {
      tail.items.push(session);
    }
  }
  return groups;
}

/**
 * Class timetable — upcoming class sessions in a rolling 7-day window with a
 * per-session roster. Data comes from the Bearer-capable
 * GET /api/venue/schedule feed (the dedicated /api/venue/classes routes are
 * cookie-only, web dashboard only). Tapping an attendee opens the existing
 * booking detail sheet, so staff actions (confirm/start/no-show/cancel) reuse
 * the Bearer booking routes.
 */
export default function ClassesScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const queryClient = useQueryClient();
  const venueId = venue?.id ?? null;
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [weekStart, setWeekStart] = useState(today);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);

  const week = useMemo(() => getWeekRangeFromDate(weekStart, timeZone), [weekStart, timeZone]);
  const sessionsQuery = useClassSessions({ from: week.from, to: week.to });
  const practitionersQuery = usePractitioners();

  // Realtime refresh — same `bookings` table the web class timetable watches.
  // Sessions and the open roster both nest under queryKeys.bookings.all(), so a
  // single invalidate refreshes the timetable and any selected session's roster.
  const onLiveRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
  }, [queryClient]);

  const liveState = useVenueLiveSync({
    venueId,
    onRefresh: onLiveRefresh,
    subscriptions: venueId ? [{ table: 'bookings', filter: `venue_id=eq.${venueId}` }] : [],
    enabled: !!venueId,
  });

  /** Instructor calendar column id → display name (best effort). */
  const calendarNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of practitionersQuery.data?.practitioners ?? []) {
      map.set(p.id, p.name);
    }
    return map;
  }, [practitionersQuery.data]);

  const instructorNameFor = (session: ClassSession): string | null =>
    session.calendarId ? (calendarNameById.get(session.calendarId) ?? null) : null;

  const groups = useMemo(
    () => groupByDate(sessionsQuery.data ?? []),
    [sessionsQuery.data],
  );
  const onToday = weekStart === today;

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen
        options={{
          title: 'Classes',
          headerRight: () =>
            liveState !== 'idle' ? (
              <View style={styles.liveWrap}>
                <LiveDot state={liveState} />
              </View>
            ) : null,
        }}
      />

      {selectedSession ? (
        <ClassRosterView
          session={selectedSession}
          instructorName={instructorNameFor(selectedSession)}
          onBack={() => setSelectedSession(null)}
          onOpenBooking={(bookingId) => setDetailBookingId(bookingId)}
        />
      ) : (
        <>
          {/* Date navigation — rolling 7-day window */}
          <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
            <IconButton
              icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              accessibilityLabel="Previous week"
              tint={colors.brand}
              onPress={() => setWeekStart(addDaysToDateStr(weekStart, -7))}
            />
            <View style={styles.navCenter}>
              <Text variant="bodyMedium">{formatRangeLabel(week.from, week.to)}</Text>
              {!onToday ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to today"
                  hitSlop={12}
                  onPress={() => setWeekStart(today)}>
                  <Text variant="caption" tone="brand">
                    Back to today
                  </Text>
                </Pressable>
              ) : (
                <Text variant="caption" tone="muted">
                  Next 7 days
                </Text>
              )}
            </View>
            <IconButton
              icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              accessibilityLabel="Next week"
              tint={colors.brand}
              onPress={() => setWeekStart(addDaysToDateStr(weekStart, 7))}
            />
          </View>

          {sessionsQuery.isLoading ? (
            <ListSkeleton />
          ) : sessionsQuery.isError ? (
            <View style={styles.stateWrap}>
              <ErrorState
                message={
                  sessionsQuery.error instanceof ApiError
                    ? sessionsQuery.error.message
                    : 'Could not load the class timetable.'
                }
                onRetry={() => void sessionsQuery.refetch()}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl
                  refreshing={sessionsQuery.isRefetching}
                  onRefresh={() => void sessionsQuery.refetch()}
                />
              }>
              {groups.length === 0 ? (
                <EmptyState
                  title="No class sessions"
                  message="There are no sessions in this week. Class types and schedules are set up on the web dashboard (Class timetable); sessions then appear here."
                />
              ) : (
                groups.map((group) => (
                  <View key={group.date} style={styles.dayGroup}>
                    <Text variant="overline" tone="secondary" style={styles.dayHeading}>
                      {group.date === today ? 'Today' : formatDayHeading(group.date)}
                    </Text>
                    {group.items.map((session) => (
                      <ClassSessionCard
                        key={session.classInstanceId}
                        session={session}
                        instructorName={instructorNameFor(session)}
                        onPress={() => setSelectedSession(session)}
                      />
                    ))}
                  </View>
                ))
              )}
              <View style={styles.spacer} />
            </ScrollView>
          )}
        </>
      )}

      {/* Existing booking command-centre, opened from the roster. */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  dayGroup: {
    gap: spacing.sm,
  },
  dayHeading: {
    marginBottom: spacing.xs,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing.xl,
  },
  liveWrap: {
    marginRight: spacing.sm,
  },
});
