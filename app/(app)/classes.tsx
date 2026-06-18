import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { ClassMonthGrid } from '@/components/classes/ClassMonthGrid';
import { ClassRosterView } from '@/components/classes/ClassRosterView';
import { ClassSessionCard } from '@/components/classes/ClassSessionCard';
import { ClassTypesManagerSheet } from '@/components/classes/ClassTypesManagerSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  addDaysToDateStr,
  calendarDateInTimeZone,
  formatDayHeading,
  formatRangeLabel,
  getMonthRangeFromDate,
  getWeekRangeFromDate,
} from '@/lib/dates/venue-dates';
import { queryKeys } from '@/lib/queries/keys';
import { useManagedClasses } from '@/lib/queries/useClassesManage';
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

/** spacing.sm gap between session cards within a day group. */
function CardSeparator() {
  return <View style={styles.cardSeparator} />;
}

/** One metric in the timetable stats bar. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="bodyMedium">{value}</Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Class timetable — upcoming class sessions in a rolling 7-day window with a
 * per-session roster. Sessions come from the Bearer-capable
 * GET /api/venue/schedule feed; tapping an attendee opens the existing booking
 * detail sheet, so staff actions (confirm/start/no-show/cancel) reuse the Bearer
 * booking routes. Creating and managing class types, sessions and weekly rules
 * is done in-app via the header "+" → {@link ClassTypesManagerSheet}; the
 * dedicated /api/venue/classes routes it calls are Bearer-capable too.
 */
export default function ClassesScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const queryClient = useQueryClient();
  const venueId = venue?.id ?? null;
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [view, setView] = useState<'agenda' | 'month'>('agenda');
  const [weekStart, setWeekStart] = useState(today);
  const [monthAnchor, setMonthAnchor] = useState(today);
  // Selected class-type filter (by class-type id); null = all types.
  const [classTypeFilterId, setClassTypeFilterId] = useState<string | null>(null);
  // Selected day in the month view; null = the whole month.
  const [monthSelectedDate, setMonthSelectedDate] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const week = useMemo(() => getWeekRangeFromDate(weekStart, timeZone), [weekStart, timeZone]);
  const month = useMemo(() => getMonthRangeFromDate(monthAnchor), [monthAnchor]);
  // Agenda reads the 7-day window; the month view its own month range.
  const range = view === 'month' ? month : week;
  const sessionsQuery = useClassSessions({ from: range.from, to: range.to });
  const practitionersQuery = usePractitioners();
  // Class types power the filter chips + the stats bar. Cheap, cached feed.
  const managedQuery = useManagedClasses();

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

  // Active class types → filter chips. The schedule feed exposes the class-type
  // NAME (not id) per session, so we filter by name (web filters by id over the
  // richer instances feed; matching by name is equivalent on the merged feed).
  const classTypes = useMemo(
    () =>
      [...(managedQuery.data?.class_types ?? [])]
        .filter((ct) => ct.is_active !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [managedQuery.data?.class_types],
  );
  const filterName = useMemo(
    () => classTypes.find((ct) => ct.id === classTypeFilterId)?.name ?? null,
    [classTypes, classTypeFilterId],
  );
  // Auto-reset the filter if the selected type is gone (web parity).
  useEffect(() => {
    if (classTypeFilterId && !classTypes.some((ct) => ct.id === classTypeFilterId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear a now-stale filter selection
      setClassTypeFilterId(null);
    }
  }, [classTypeFilterId, classTypes]);

  const filteredSessions = useMemo(() => {
    const all = sessionsQuery.data ?? [];
    return filterName ? all.filter((s) => s.name === filterName) : all;
  }, [sessionsQuery.data, filterName]);

  // Stats bar (web `ClassTimetableStatsRow`): active types, sessions in the next
  // 7 days, upcoming sessions in view, total booked spots in view. Computed from
  // the in-view (filtered) feed + the class-type list.
  const stats = useMemo(() => {
    const next7 = addDaysToDateStr(today, 7);
    const upcoming = filteredSessions.filter((s) => s.date >= today);
    return {
      activeTypes: filterName ? 1 : classTypes.length,
      next7: upcoming.filter((s) => s.date < next7).length,
      upcoming: upcoming.length,
      bookedSpots: filteredSessions.reduce((sum, s) => sum + (s.bookedSpots ?? 0), 0),
    };
  }, [filteredSessions, classTypes.length, filterName, today]);

  // Agenda sections — one per calendar date, in feed order (soonest first).
  const sections = useMemo(
    () =>
      groupByDate(filteredSessions).map((group) => ({
        date: group.date,
        data: group.items,
      })),
    [filteredSessions],
  );

  // Month view: the agenda below the grid shows the selected day, else all month
  // sessions grouped by day.
  const monthSections = useMemo(() => {
    const list = monthSelectedDate
      ? filteredSessions.filter((s) => s.date === monthSelectedDate)
      : filteredSessions;
    return groupByDate(list).map((group) => ({ date: group.date, data: group.items }));
  }, [filteredSessions, monthSelectedDate]);

  const onToday = weekStart === today;

  return (
    <Screen scroll={false} padded={false}>
      {/* The (app) Stack hides the OS header for this route, so the title, the
          live indicator and the create/manage entry point live in-body below
          (the old headerRight was never rendered → no way to add a class). */}
      <Stack.Screen options={{ title: 'Classes' }} />

      {selectedSession ? (
        <ClassRosterView
          session={selectedSession}
          instructorName={instructorNameFor(selectedSession)}
          onBack={() => setSelectedSession(null)}
          onOpenBooking={(bookingId) => setDetailBookingId(bookingId)}
        />
      ) : (
        <>
          {/* In-body screen header — title, live-sync dot, and the always-visible
              "New class" action that opens the create/manage sheet. */}
          <View style={styles.screenHeader}>
            <Text variant="subheading">Classes</Text>
            <View style={styles.headerActions}>
              {liveState !== 'idle' ? <LiveDot state={liveState} /> : null}
              <Button label="New class" size="sm" onPress={() => setManagerOpen(true)} />
            </View>
          </View>

          {/* Agenda | Month toggle */}
          <View style={styles.toggleBar}>
            <Segmented<'agenda' | 'month'>
              options={[
                { value: 'agenda', label: 'Agenda' },
                { value: 'month', label: 'Month' },
              ]}
              value={view}
              onChange={(next) => {
                setView(next);
                setMonthSelectedDate(null);
              }}
            />
          </View>

          {/* Stats bar (web parity): active types · next 7 days · upcoming · booked */}
          <View style={styles.statsRow}>
            <Stat value={stats.activeTypes} label="Active types" />
            <Stat value={stats.next7} label="Next 7 days" />
            <Stat value={stats.upcoming} label="Upcoming" />
            <Stat value={stats.bookedSpots} label="Booked" />
          </View>

          {/* Per-class-type filter chips */}
          {classTypes.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}>
              <Chip
                label="All"
                selected={classTypeFilterId === null}
                onPress={() => setClassTypeFilterId(null)}
              />
              {classTypes.map((ct) => (
                <Chip
                  key={ct.id}
                  label={ct.name}
                  selectedColor={ct.colour ?? undefined}
                  selected={classTypeFilterId === ct.id}
                  onPress={() =>
                    setClassTypeFilterId(classTypeFilterId === ct.id ? null : ct.id)
                  }
                />
              ))}
            </ScrollView>
          ) : null}

          {/* Date navigation — agenda only (the month view has its own nav) */}
          {view === 'agenda' ? (
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
          ) : null}

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
            <SectionList
              sections={view === 'month' ? monthSections : sections}
              keyExtractor={(session) => session.classInstanceId}
              ListHeaderComponent={
                view === 'month' ? (
                  <ClassMonthGrid
                    monthAnchor={monthAnchor}
                    onChangeMonth={(next) => {
                      setMonthAnchor(next);
                      setMonthSelectedDate(null);
                    }}
                    today={today}
                    sessions={filteredSessions}
                    selectedDate={monthSelectedDate}
                    onSelectDate={setMonthSelectedDate}
                    isLoading={sessionsQuery.isRefetching}
                  />
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.stateWrap}>
                  <EmptyState
                    title="No class sessions"
                    message={
                      view === 'month'
                        ? 'No sessions in this month. Add a class, schedule sessions, or set up a weekly rule.'
                        : "There are no sessions in this week. Add a class, schedule sessions, or set up a weekly rule — they'll appear here."
                    }
                    actionLabel="Manage classes"
                    onAction={() => setManagerOpen(true)}
                  />
                </View>
              }
              renderSectionHeader={({ section }) => (
                <Text variant="overline" tone="secondary" style={styles.dayHeading}>
                  {section.date === today ? 'Today' : formatDayHeading(section.date)}
                </Text>
              )}
              renderItem={({ item }) => (
                <ClassSessionCard
                  session={item}
                  instructorName={instructorNameFor(item)}
                  onPress={() => setSelectedSession(item)}
                />
              )}
              // Reproduce the prior layout gaps: spacing.sm between cards in a
              // day, spacing.base after each day group.
              ItemSeparatorComponent={CardSeparator}
              renderSectionFooter={() => <View style={styles.sectionGap} />}
              ListFooterComponent={<View style={styles.spacer} />}
              contentContainerStyle={styles.content}
              stickySectionHeadersEnabled={false}
              initialNumToRender={8}
              windowSize={11}
              removeClippedSubviews
              refreshControl={
                <RefreshControl
                  refreshing={sessionsQuery.isRefetching}
                  onRefresh={() => void sessionsQuery.refetch()}
                />
              }
            />
          )}
        </>
      )}

      {/* Existing booking command-centre, opened from the roster. */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />

      {/* In-app class-types manager (create/edit/schedule), reached from the header. */}
      <ClassTypesManagerSheet visible={managerOpen} onClose={() => setManagerOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleBar: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
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
  },
  dayHeading: {
    // spacing.xs + spacing.sm reproduces the old group's heading→card gap.
    marginBottom: spacing.xs + spacing.sm,
  },
  cardSeparator: {
    height: spacing.sm,
  },
  sectionGap: {
    height: spacing.base,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing.xl,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
