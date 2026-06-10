import { SymbolView } from 'expo-symbols';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { BookingPeekSheet } from '@/components/bookings/BookingPeekSheet';
import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekStrip } from '@/components/calendar/WeekStrip';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Snackbar } from '@/components/ui/Snackbar';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { newBookingActionLabel } from '@/lib/booking/terminology';
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  calendarDateInTimeZone,
  formatDayHeading,
  formatMonthLabel,
  formatRangeLabel,
  getCalendarWeekFromDate,
  getMonthRangeFromDate,
  type DateRange,
} from '@/lib/dates/venue-dates';
import { useCalendarBlocks } from '@/lib/queries/useAvailabilityManage';
import { useRescheduleBooking } from '@/lib/queries/useBookingMutations';
import { useCalendarGrid } from '@/lib/queries/useCalendarGrid';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';

type Scope = 'day' | 'week' | 'month';

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];


/** Current wall-clock time (minutes since midnight) in the venue timezone. */
function nowMinutesInTz(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/**
 * Calendar tab (default tab — `index` route). Day/Week/Month views of the
 * practitioner schedule, with long-press to reschedule.
 */
export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue, terminology } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [scope, setScope] = useState<Scope>('day');
  const [anchor, setAnchor] = useState<string>(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [peekBookingId, setPeekBookingId] = useState<string | null>(null);
  // Undo state for the last reschedule (6s window).
  const [undoState, setUndoState] = useState<{
    target: RescheduleTarget;
    durationChanged: boolean;
  } | null>(null);
  const undoTarget = undoState?.target ?? null;
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoMutation = useRescheduleBooking(undoTarget?.id ?? '');

  const showUndo = useCallback(
    (previous: RescheduleTarget, meta: { durationChanged: boolean }) => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoState({ target: previous, durationChanged: meta.durationChanged });
      undoTimer.current = setTimeout(() => setUndoState(null), 6000);
    },
    [],
  );

  const handleUndo = useCallback(() => {
    if (!undoState) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const { target, durationChanged } = undoState;
    undoMutation.mutate(
      {
        date: target.date,
        time: `${target.time.slice(0, 5)}:00`,
        ...(durationChanged && target.durationMinutes != null
          ? { durationMinutes: target.durationMinutes }
          : {}),
      },
      { onSettled: () => setUndoState(null) },
    );
  }, [undoState, undoMutation]);

  const week = useMemo(() => getCalendarWeekFromDate(anchor), [anchor]);
  const range = useMemo<DateRange>(() => {
    if (scope === 'week') return { from: week.from, to: week.to };
    if (scope === 'month') return getMonthRangeFromDate(anchor);
    return { from: anchor, to: anchor };
  }, [scope, anchor, week]);

  const practitionersQuery = usePractitioners();
  const practitioners = useMemo<Practitioner[]>(() => {
    const list = practitionersQuery.data?.practitioners ?? [];
    return [...list].filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order);
  }, [practitionersQuery.data]);

  const calendarIds = useMemo(() => practitioners.map((p) => p.id), [practitioners]);

  const gridQuery = useCalendarGrid({
    calendarIds,
    from: range.from,
    to: range.to,
    enabled: calendarIds.length > 0,
  });

  const effectiveId =
    selectedId && calendarIds.includes(selectedId) ? selectedId : calendarIds[0] ?? null;

  const day = useMemo(() => {
    const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === effectiveId);
    return calendar?.dates.find((d) => d.date === anchor) ?? null;
  }, [gridQuery.data, effectiveId, anchor]);

  // Breaks/blocks for the visible range — rendered as non-bookable overlays.
  const blocksQuery = useCalendarBlocks(range.from, range.to);
  const dayBlocks = useMemo(() => {
    const rows = blocksQuery.data?.blocks ?? [];
    const oneOff = rows
      .filter(
        (b) =>
          (b.practitioner_id ?? b.calendar_id) === effectiveId &&
          b.block_date === anchor &&
          !b.class_instance_id,
      )
      .map((b) => ({ id: b.id, start: b.start_time, end: b.end_time, label: b.reason }));

    // Recurring breaks from the practitioner's schedule (every-day or per-weekday).
    const practitioner = practitioners.find((p) => p.id === effectiveId);
    const [y, m, d] = anchor.split('-').map(Number);
    const weekday = new Date(y!, m! - 1, d!).getDay(); // Sun=0
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const byDay = practitioner?.break_times_by_day;
    const hasByDay = byDay && Object.keys(byDay).length > 0;
    const breakRanges = hasByDay
      ? byDay[String(weekday)] ?? byDay[dayNames[weekday]!] ?? []
      : practitioner?.break_times ?? [];
    const breaks = breakRanges.map((range, index) => ({
      id: `break-${effectiveId}-${index}`,
      start: range.start,
      end: range.end,
      label: 'Break',
    }));

    return [...oneOff, ...breaks];
  }, [blocksQuery.data, effectiveId, anchor, practitioners]);

  /** date → total bookings across all calendars (for week strip + month grid). */
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const calendar of gridQuery.data?.calendars ?? []) {
      for (const d of calendar.dates) {
        map[d.date] = (map[d.date] ?? 0) + d.bookings.length;
      }
    }
    return map;
  }, [gridQuery.data]);

  const isToday = anchor === today;
  const nowMinutes = isToday ? nowMinutesInTz(timeZone) : null;

  const label =
    scope === 'day'
      ? formatDayHeading(anchor)
      : scope === 'week'
        ? formatRangeLabel(week.from, week.to)
        : formatMonthLabel(anchor);

  const step = useCallback(
    (direction: -1 | 1) => {
      setAnchor((current) => {
        if (scope === 'month') return addMonthsToDateStr(current, direction);
        if (scope === 'week') return addDaysToDateStr(current, direction * 7);
        return addDaysToDateStr(current, direction);
      });
    },
    [scope],
  );

  const goToday = useCallback(() => setAnchor(today), [today]);

  const openBooking = useCallback(
    (id: string) => router.push(`/booking/${id}` as Href),
    [router],
  );

  // Tap a block → quick peek sheet (full detail is one tap further).
  const peekBooking = useCallback((id: string) => setPeekBookingId(id), []);

  const createAt = useCallback(
    (time: string) => {
      router.push({
        pathname: '/booking/new',
        params: { date: anchor, practitionerId: effectiveId ?? '', time },
      });
    },
    [router, anchor, effectiveId],
  );

  const startReschedule = useCallback(
    (bookingId: string) => {
      const booking = day?.bookings.find((b) => b.id === bookingId);
      if (booking) {
        const start = timeToMinutes(booking.startTime);
        const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
        const durationMinutes = end != null && end > start ? end - start : null;
        setRescheduleTarget({
          id: booking.id,
          guestName: booking.guestName,
          date: anchor,
          time: booking.startTime,
          durationMinutes,
        });
      }
    },
    [day, anchor],
  );

  const dayGrid = (
    <CalendarDayGrid
      bookings={day?.bookings ?? []}
      workingHours={day?.workingHours ?? []}
      timeBlocks={dayBlocks}
      nowMinutes={nowMinutes}
      onBlockPress={peekBooking}
      onBlockLongPress={startReschedule}
      onEmptyPress={createAt}
    />
  );

  return (
    <Screen padded={false}>
      {practitionersQuery.isLoading ? (
        <LoadingState message="Loading calendar…" />
      ) : practitionersQuery.isError ? (
        <ErrorState
          message={
            practitionersQuery.error instanceof ApiError
              ? practitionersQuery.error.message
              : practitionersQuery.error?.message ?? 'Could not load practitioners.'
          }
          onRetry={() => void practitionersQuery.refetch()}
        />
      ) : practitioners.length === 0 ? (
        <EmptyState
          title="No practitioners yet"
          message="Add practitioners on the web dashboard and they'll appear here as calendar columns."
        />
      ) : (
        <>
          <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
            <Segmented value={scope} onChange={setScope} options={SCOPE_OPTIONS} />

            <View style={styles.dateNav}>
              <ChevButton dir="left" onPress={() => step(-1)} />
              <Pressable
                onPress={goToday}
                accessibilityRole="button"
                accessibilityHint="Jump to today"
                style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
                <Text variant="subheading" numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
              <ChevButton dir="right" onPress={() => step(1)} />
              {!isToday ? (
                <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
                  <Pressable
                    onPress={goToday}
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
                </Animated.View>
              ) : null}
            </View>

            {scope !== 'month' ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {practitioners.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={p.id === effectiveId}
                    onPress={() => setSelectedId(p.id)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>

          {gridQuery.isLoading ? (
            <LoadingState message="Loading appointments…" />
          ) : gridQuery.isError ? (
            <ErrorState
              message={
                gridQuery.error instanceof ApiError
                  ? gridQuery.error.message
                  : gridQuery.error?.message ?? 'Could not load the calendar.'
              }
              onRetry={() => void gridQuery.refetch()}
            />
          ) : scope === 'month' ? (
            <ScrollView>
              <MonthGrid
                anchor={anchor}
                today={today}
                counts={counts}
                onSelectDay={(date) => {
                  setAnchor(date);
                  setScope('day');
                }}
              />
            </ScrollView>
          ) : scope === 'week' ? (
            <View style={styles.weekBody}>
              <View style={[styles.weekStripWrap, { borderBottomColor: colors.border }]}>
                <WeekStrip
                  days={week.days}
                  selectedDate={anchor}
                  today={today}
                  counts={counts}
                  onSelectDay={setAnchor}
                />
              </View>
              {dayGrid}
            </View>
          ) : (
            dayGrid
          )}

          <Fab
            accessibilityLabel={newBookingActionLabel(terminology)}
            onPress={() => router.push('/booking/new')}
          />
        </>
      )}

      <RescheduleSheet
        target={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onMoved={showUndo}
      />
      <Snackbar
        message={undoTarget ? `Moved ${undoTarget.guestName}'s booking` : null}
        actionLabel="Undo"
        onAction={handleUndo}
      />
      <BookingPeekSheet
        bookingId={peekBookingId}
        onClose={() => setPeekBookingId(null)}
        onOpenFull={(id) => {
          setPeekBookingId(null);
          openBooking(id);
        }}
      />
    </Screen>
  );
}

function ChevButton({ dir, onPress }: { dir: 'left' | 'right'; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? 'Previous' : 'Next'}
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
  chevButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  weekBody: {
    flex: 1,
  },
  weekStripWrap: {
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
