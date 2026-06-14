import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { AllCalendarsDayGrid } from '@/components/calendar/AllCalendarsDayGrid';
import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekStrip } from '@/components/calendar/WeekStrip';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { IconButton } from '@/components/ui/IconButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { newBookingActionLabel } from '@/lib/booking/terminology';
import { hapticSelect, hapticSuccess } from '@/lib/haptics';
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
import { useRescheduleBookingById } from '@/lib/queries/useBookingMutations';
import {
  useCalendarStatusAction,
  useCalendarArrivalAction,
} from '@/lib/queries/useCalendarQuickActions';
import { useCalendarGrid } from '@/lib/queries/useCalendarGrid';
import { useComplianceBookingFlags } from '@/lib/queries/useCompliance';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CalendarGridDay } from '@/types/calendar-grid';
import type { Practitioner } from '@/types/practitioner';
import type { CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';

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
 * Live "minutes since midnight" in the venue timezone, re-evaluated every 60s
 * so the now-line advances. The interval only runs while `active` (the anchor
 * day is today) — off-today days never need a ticking clock. Returns null when
 * inactive so callers can hide the now-line.
 */
function useNowMinutes(timeZone: string, active: boolean): number | null {
  // A monotonically-increasing tick that re-evaluates the clock each minute.
  // We derive `minutes` from this during render (not via setState) so the
  // effect only owns the timer — never a synchronous state write.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [active]);

  return useMemo(() => {
    if (!active) return null;
    return nowMinutesInTz(timeZone);
    // `tick` is an intentional dependency — it advances the clock each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone, active, tick]);
}

/** What the add-action sheet was opened for. */
type AddSheetTarget =
  | { kind: 'fab' }
  | { kind: 'slot'; time: string; practitionerId: string };

/**
 * Calendar tab (default tab — `index` route). Day/Week/Month views of one
 * practitioner's schedule at a time, with switcher chips to move between
 * calendars, inline status actions, hold-drag move/resize, block
 * create/edit/delete, status filter, and walk-in shortcut.
 */
export default function CalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { colors } = useTheme();
  const { venue, terminology, featureFlags } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const complianceEnabled = featureFlags?.resolved?.compliance_records_enabled === true;
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [scope, setScope] = useState<Scope>('day');
  const [anchor, setAnchor] = useState<string>(today);

  // Deep-link support: a `?date=YYYY-MM-DD` param (e.g. from a notification)
  // jumps the diary to that day.
  useEffect(() => {
    const d = typeof params.date === 'string' ? params.date : null;
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync anchor/scope to deep-link param
      setAnchor(d);
      setScope('day');
    }
  }, [params.date]);

  // `selectedId` is a calendar id, or the 'all' sentinel for the multi-calendar
  // day view (reception parity). null falls back to the first calendar.
  const ALL_CALENDARS = 'all' as const;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [addSheetTarget, setAddSheetTarget] = useState<AddSheetTarget | null>(null);

  // Pending action tracking for inline status tray + drag commits.
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  const removePending = useCallback((bookingId: string) => {
    setPendingActionIds((prev) => {
      const next = new Set(prev);
      next.delete(bookingId);
      return next;
    });
  }, []);

  const toast = useToast();

  // One mutation for drag commits AND undo — the booking id travels in the input.
  const rescheduleById = useRescheduleBookingById();

  // Restore a booking to its previous slot (Undo on the reschedule toast).
  const undoReschedule = useCallback(
    (previous: RescheduleTarget, durationChanged: boolean) => {
      rescheduleById.mutate({
        bookingId: previous.id,
        date: previous.date,
        time: `${previous.time.slice(0, 5)}:00`,
        ...(durationChanged && previous.durationMinutes != null
          ? { durationMinutes: previous.durationMinutes }
          : {}),
      });
    },
    [rescheduleById],
  );

  const showUndo = useCallback(
    (previous: RescheduleTarget, meta: { durationChanged: boolean }) => {
      toast.show({
        message: `Moved ${previous.guestName}'s booking`,
        actionLabel: 'Undo',
        onAction: () => undoReschedule(previous, meta.durationChanged),
      });
    },
    [toast, undoReschedule],
  );

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
    // Near-realtime: a second device's changes surface within ~60s (web has
    // live sync; the app polls). Pull-to-refresh forces an immediate refetch.
    refetchInterval: 60_000,
  });

  // The calendar being viewed — one at a time, switched via the chips row, OR
  // the 'all' multi-calendar day view. null falls back to the first calendar.
  const isAllView =
    selectedId === ALL_CALENDARS && scope === 'day' && practitioners.length > 1;
  const effectiveId =
    selectedId && selectedId !== ALL_CALENDARS && calendarIds.includes(selectedId)
      ? selectedId
      : calendarIds[0] ?? null;

  const day = useMemo(() => {
    const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === effectiveId);
    return calendar?.dates.find((d) => d.date === anchor) ?? null;
  }, [gridQuery.data, effectiveId, anchor]);

  /**
   * Build the day's non-bookable overlays for a calendar+date. One-off blocks
   * come straight from the grid payload (`day.blocks` — same `calendar_blocks`
   * source the old second query duplicated), so there's no redundant fetch.
   * Recurring breaks are derived from the practitioner record.
   */
  const getDayBlocks = useCallback(
    (calId: string, dateStr: string, gridDay: CalendarGridDay | null): CalendarTimeBlock[] => {
      const oneOff: CalendarTimeBlock[] = (gridDay?.blocks ?? []).map((b) => ({
        id: b.id,
        start: b.startTime,
        end: b.endTime,
        label: b.reason,
        isEditable: true,
      }));

      const practitioner = practitioners.find((p) => p.id === calId);
      const [y, m, d] = dateStr.split('-').map(Number);
      const weekday = new Date(y!, m! - 1, d!).getDay();
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const byDay = practitioner?.break_times_by_day;
      const hasByDay = byDay && Object.keys(byDay).length > 0;
      const breakRanges = hasByDay
        ? byDay[String(weekday)] ?? byDay[dayNames[weekday]!] ?? []
        : practitioner?.break_times ?? [];
      const breaks: CalendarTimeBlock[] = breakRanges.map((range, index) => ({
        id: `break-${calId}-${index}`,
        start: range.start,
        end: range.end,
        label: 'Break',
        isEditable: false,
      }));

      return [...oneOff, ...breaks];
    },
    [practitioners],
  );

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

  /** practitionerId → bookings on the anchor date (badges on the switcher chips). */
  const perPractitionerCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const calendar of gridQuery.data?.calendars ?? []) {
      const dateData = calendar.dates.find((d) => d.date === anchor);
      map[calendar.calendarId] = dateData?.bookings.length ?? 0;
    }
    return map;
  }, [gridQuery.data, anchor]);

  /** All-calendars total for the anchor date (badge on the "All" chip). */
  const totalDayCount = useMemo(
    () => Object.values(perPractitionerCounts).reduce((sum, n) => sum + n, 0),
    [perPractitionerCounts],
  );

  const isToday = anchor === today;
  // Live now-line — re-ticks every 60s while viewing today (null otherwise).
  const nowMinutes = useNowMinutes(timeZone, isToday);

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

  // Tap a block → full booking detail
  const openDetail = useCallback((id: string) => setDetailBookingId(id), []);

  const createAt = useCallback(
    (time: string) => {
      setAddSheetTarget({ kind: 'slot', time, practitionerId: effectiveId ?? '' });
    },
    [effectiveId],
  );

  /** Empty-slot tap in the multi-calendar view — carries the target column. */
  const createAtFor = useCallback((practitionerId: string, time: string) => {
    setAddSheetTarget({ kind: 'slot', time, practitionerId });
  }, []);

  /** Look up a booking on the viewed calendar for the anchor date. */
  const findBookingOnAnchor = useCallback(
    (bookingId: string) => {
      for (const cal of gridQuery.data?.calendars ?? []) {
        const dateData = cal.dates.find((d) => d.date === anchor);
        if (!dateData) continue;
        const booking = dateData.bookings.find((b) => b.id === bookingId);
        if (booking) return booking;
      }
      return null;
    },
    [gridQuery.data, anchor],
  );

  // ---- Hold-drag move / resize commits ----

  const commitDrag = useCallback(
    (input: {
      bookingId: string;
      time: string;
      durationMinutes?: number;
      previousTarget: RescheduleTarget;
      durationChanged: boolean;
    }) => {
      setPendingActionIds((prev) => new Set([...prev, input.bookingId]));
      rescheduleById.mutate(
        {
          bookingId: input.bookingId,
          date: anchor,
          time: input.time,
          ...(input.durationMinutes != null ? { durationMinutes: input.durationMinutes } : {}),
        },
        {
          onSuccess: () => {
            // Drop haptic already fired in the drag worklet; just confirm + undo.
            removePending(input.bookingId);
            showUndo(input.previousTarget, { durationChanged: input.durationChanged });
          },
          onError: (error) => {
            removePending(input.bookingId);
            toast.error(
              error instanceof ApiError
                ? error.message
                : input.durationChanged
                  ? 'Could not change duration. Try again.'
                  : 'Could not reschedule. Try another time.',
            );
          },
        },
      );
    },
    [anchor, rescheduleById, removePending, showUndo, toast],
  );

  const handleDragReschedule = useCallback(
    (bookingId: string, newTime: string) => {
      const booking = findBookingOnAnchor(bookingId);
      if (!booking || newTime === booking.startTime.slice(0, 5)) return;

      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      commitDrag({
        bookingId,
        time: `${newTime}:00`,
        previousTarget: {
          id: bookingId,
          guestName: booking.guestName ?? 'booking',
          date: anchor,
          time: booking.startTime,
          durationMinutes: end != null && end > start ? end - start : null,
        },
        durationChanged: false,
      });
    },
    [findBookingOnAnchor, anchor, commitDrag],
  );

  const handleDragResize = useCallback(
    (bookingId: string, newDurationMinutes: number) => {
      const booking = findBookingOnAnchor(bookingId);
      if (!booking) return;

      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      commitDrag({
        bookingId,
        time: `${booking.startTime.slice(0, 5)}:00`,
        durationMinutes: newDurationMinutes,
        previousTarget: {
          id: bookingId,
          guestName: booking.guestName ?? 'booking',
          date: anchor,
          time: booking.startTime,
          durationMinutes: end != null && end > start ? end - start : null,
        },
        durationChanged: true,
      });
    },
    [findBookingOnAnchor, anchor, commitDrag],
  );

  // Drag dropped on a conflicting slot — the grid refuses the move; surface why.
  const handleDragConflictReject = useCallback(() => {
    toast.error("That time isn't available");
  }, [toast]);

  const handleBlockTimeBlockPress = useCallback(
    (blockId: string) => {
      // One-off blocks come from the grid payload (`day.blocks`); practitioner +
      // date are the current view context (no separate blocks fetch needed).
      const block = day?.blocks.find((b) => b.id === blockId);
      if (!block || !effectiveId) return;
      setBlockTarget({
        mode: 'edit',
        blockId: block.id,
        practitionerId: effectiveId,
        date: anchor,
        startTime: block.startTime,
        endTime: block.endTime,
        reason: block.reason,
      });
    },
    [day, effectiveId, anchor],
  );

  // ---- Inline quick-status actions ----
  const calendarStatusAction = useCalendarStatusAction();
  const calendarArrivalAction = useCalendarArrivalAction();

  const handleStatusChange = useCallback(
    (bookingId: string, status: string) => {
      setPendingActionIds((prev) => new Set([...prev, bookingId]));
      calendarStatusAction.mutate(
        { bookingId, status: status as import('@/types/booking-detail').BookingStatus },
        {
          onSuccess: () => {
            hapticSuccess();
            removePending(bookingId);
          },
          onError: (error) => {
            removePending(bookingId);
            toast.error(
              error instanceof ApiError ? error.message : 'Could not update booking.',
            );
          },
        },
      );
    },
    [calendarStatusAction, removePending, toast],
  );

  const handleArrivalToggle = useCallback(
    (bookingId: string, arrived: boolean) => {
      setPendingActionIds((prev) => new Set([...prev, bookingId]));
      calendarArrivalAction.mutate(
        { bookingId, client_arrived: arrived },
        {
          onSuccess: () => {
            hapticSuccess();
            removePending(bookingId);
          },
          onError: (error) => {
            removePending(bookingId);
            toast.error(
              error instanceof ApiError ? error.message : 'Could not update attendance.',
            );
          },
        },
      );
    },
    [calendarArrivalAction, removePending, toast],
  );

  // ---- Day data for the viewed calendar ----

  const dayBookings = useMemo(() => day?.bookings ?? [], [day]);

  const dayBlocks = useMemo(
    () => (effectiveId ? getDayBlocks(effectiveId, anchor, day) : []),
    [getDayBlocks, effectiveId, anchor, day],
  );

  // ---- Multi-calendar ("All") day view data ----
  // One column per practitioner for the anchor date, sharing the time gutter.
  const allCalendarsForDay = useMemo(() => {
    if (!isAllView) return [];
    return practitioners.map((p) => {
      const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === p.id);
      const calDay = calendar?.dates.find((d) => d.date === anchor) ?? null;
      return {
        calendarId: p.id,
        calendarName: p.name,
        workingHours: calDay?.workingHours ?? [],
        bookings: calDay?.bookings ?? [],
        sessions: calDay?.sessions ?? [],
        timeBlocks: getDayBlocks(p.id, anchor, calDay),
      };
    });
  }, [isAllView, practitioners, gridQuery.data, anchor, getDayBlocks]);

  // Per-booking compliance flags for the visible day — gated on the feature
  // flag so non-compliance venues never hit the endpoint. Unfiltered ids so
  // the status filter doesn't churn the query key.
  const visibleBookingIds = useMemo(
    () => (day?.bookings ?? []).map((b) => b.id),
    [day],
  );
  const complianceFlagsQuery = useComplianceBookingFlags(
    complianceEnabled ? visibleBookingIds : [],
  );
  const complianceFlags = complianceFlagsQuery.data?.flags;

  // Closed-day notice — the practitioner has no working hours and nothing
  // booked for this date (web parity: closed days are visibly flagged).
  const dayIsClosed =
    !gridQuery.isLoading &&
    (day?.workingHours?.length ?? 0) === 0 &&
    (day?.bookings?.length ?? 0) === 0;

  const refreshing = gridQuery.isFetching && !gridQuery.isLoading;
  const onRefresh = useCallback(() => void gridQuery.refetch(), [gridQuery]);

  // Class/event capacity blocks from the grid payload (rendered indigo).
  const daySessions = useMemo(() => day?.sessions ?? [], [day]);

  const dayGrid = (
    <CalendarDayGrid
      // Remount when the viewed calendar or day changes so scroll-to-now
      // re-runs (returning to today / switching practitioner re-scrolls).
      key={`${effectiveId ?? 'none'}:${anchor}`}
      bookings={dayBookings}
      workingHours={day?.workingHours ?? []}
      timeBlocks={dayBlocks}
      sessions={daySessions}
      nowMinutes={nowMinutes}
      onBlockPress={openDetail}
      onStatusChange={handleStatusChange}
      onArrivalToggle={handleArrivalToggle}
      pendingActionIds={pendingActionIds}
      complianceFlags={complianceFlags}
      onEmptyPress={createAt}
      onBlockTimeBlockPress={handleBlockTimeBlockPress}
      onDragReschedule={handleDragReschedule}
      onDragResize={handleDragResize}
      onDragConflictReject={handleDragConflictReject}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );

  // ---- Add-action sheet (FAB + empty-slot tap) ----

  const nowTime =
    nowMinutes != null
      ? `${String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`
      : '12:00';

  const closeAddSheet = useCallback(() => setAddSheetTarget(null), []);

  const addSheetSlot = addSheetTarget?.kind === 'slot' ? addSheetTarget : null;

  return (
    <Screen padded={false}>
      <ErrorBoundary label="the calendar">
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
          icon={
            <SymbolView
              name={{ ios: 'person.2', android: 'group', web: 'group' }}
              tintColor={colors.textMuted}
              size={44}
            />
          }
          title="No practitioners yet"
          message="Add practitioners on the web dashboard and they'll appear here as calendars."
        />
      ) : (
        <>
          <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
            <Segmented value={scope} onChange={setScope} options={SCOPE_OPTIONS} />

            <View style={styles.dateNav}>
              <IconButton
                icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
                accessibilityLabel="Previous"
                onPress={() => step(-1)}
              />
              {/* Label flexes, so the Today pill appearing never moves the arrows. */}
              <Pressable
                onPress={goToday}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint="Jump to today"
                style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
                <Text variant="heading" numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
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
              <IconButton
                icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                accessibilityLabel="Next"
                onPress={() => step(1)}
              />
            </View>

            {/* Calendar switcher — one calendar at a time, plus an "All" view
                (day scope only) that shows every calendar side-by-side. */}
            {scope !== 'month' && practitioners.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {scope === 'day' ? (
                  <Chip
                    label="All"
                    count={totalDayCount}
                    selected={isAllView}
                    onPress={() => {
                      if (!isAllView) {
                        hapticSelect();
                        setSelectedId(ALL_CALENDARS);
                      }
                    }}
                  />
                ) : null}
                {practitioners.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    count={scope === 'day' ? perPractitionerCounts[p.id] : undefined}
                    selected={!isAllView && p.id === effectiveId}
                    onPress={() => {
                      if (isAllView || p.id !== effectiveId) {
                        hapticSelect();
                        setSelectedId(p.id);
                      }
                    }}
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
              {dayIsClosed ? <ClosedDayBanner /> : null}
              {dayGrid}
            </View>
          ) : isAllView ? (
            <View style={styles.weekBody}>
              <AllCalendarsDayGrid
                calendars={allCalendarsForDay}
                nowMinutes={nowMinutes}
                onBlockPress={openDetail}
                onEmptyPress={createAtFor}
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            </View>
          ) : (
            <View style={styles.weekBody}>
              {dayIsClosed ? <ClosedDayBanner /> : null}
              {dayGrid}
            </View>
          )}

          <Fab
            accessibilityLabel={newBookingActionLabel(terminology)}
            onPress={() => setAddSheetTarget({ kind: 'fab' })}
          />
        </>
      )}

      {/* Add-action sheet — replaces Alert menus (no-ops on web). */}
      <Sheet visible={addSheetTarget !== null} onClose={closeAddSheet}>
        <Text variant="subheading">
          {addSheetSlot ? `Add at ${addSheetSlot.time}` : 'Add to calendar'}
        </Text>
        <View style={styles.addSheetActions}>
          <Button
            label={newBookingActionLabel(terminology)}
            variant="primary"
            fullWidth
            onPress={() => {
              const slot = addSheetSlot;
              closeAddSheet();
              router.push({
                pathname: '/booking/new',
                params: slot
                  ? { date: anchor, practitionerId: slot.practitionerId, time: slot.time }
                  : {},
              });
            }}
          />
          {addSheetTarget?.kind === 'fab' ? (
            <Button
              label="Walk-in"
              variant="secondary"
              fullWidth
              onPress={() => {
                closeAddSheet();
                router.push({
                  pathname: '/booking/new',
                  params: { date: anchor, time: nowTime, intent: 'walk-in' },
                });
              }}
            />
          ) : (
            <Button
              label="Block time"
              variant="secondary"
              fullWidth
              onPress={() => {
                const slot = addSheetSlot;
                closeAddSheet();
                if (slot) {
                  setBlockTarget({
                    mode: 'create',
                    practitionerId: slot.practitionerId,
                    date: anchor,
                    startTime: slot.time,
                  });
                }
              }}
            />
          )}
          <Button label="Cancel" variant="ghost" fullWidth onPress={closeAddSheet} />
        </View>
      </Sheet>

      {/* Reschedule undo + all error feedback now route through the toast host
          (Alert.alert is a no-op on web; the manual Snackbar timer is gone). */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />
      <BlockEditSheet
        target={blockTarget}
        onClose={() => setBlockTarget(null)}
      />
      </ErrorBoundary>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ClosedDayBanner() {
  const { colors } = useTheme();
  return (
    <View style={[styles.closedBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="caption" tone="muted">
        Not scheduled to work this day — tap a slot to book anyway or block time.
      </Text>
    </View>
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
  closedBanner: {
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addSheetActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
