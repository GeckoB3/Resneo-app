import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { ColumnVisibilitySheet } from '@/components/calendar/ColumnVisibilitySheet';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { MultiColumnDayGrid } from '@/components/calendar/MultiColumnDayGrid';
import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekStrip } from '@/components/calendar/WeekStrip';
import {
  StatusFilterBar,
  applyStatusFilter,
  type CalendarStatusFilter,
} from '@/components/calendar/StatusFilterBar';
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
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
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
import {
  useCalendarStatusAction,
  useCalendarArrivalAction,
} from '@/lib/queries/useCalendarQuickActions';
import { useCalendarGrid } from '@/lib/queries/useCalendarGrid';
import { useComplianceBookingFlags } from '@/lib/queries/useCompliance';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
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
 * practitioner schedule with multi-practitioner day columns, inline status
 * actions, block create/edit/delete, status filter, and walk-in shortcut.
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>('All');
  const [columnSheetVisible, setColumnSheetVisible] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string> | null>(null); // null = all

  // Pending action tracking for inline status tray
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  // Undo state for the last reschedule (6s window).
  const [undoState, setUndoState] = useState<{
    target: RescheduleTarget;
    durationChanged: boolean;
  } | null>(null);
  const undoTarget = undoState?.target ?? null;
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoMutation = useRescheduleBooking(undoTarget?.id ?? '');

  // Drag-reschedule mutation — tracks the active drag booking id so the
  // mutation's API path is correct. Updated just before calling mutate.
  const [dragBookingId, setDragBookingId] = useState<string>('');
  const dragRescheduleMutation = useRescheduleBooking(dragBookingId);

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

  // Initialise visible column ids once practitioners load
  useEffect(() => {
    if (practitioners.length > 0 && visibleColumnIds === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed initial column set once data loads
      setVisibleColumnIds(new Set(practitioners.map((p) => p.id)));
    }
  }, [practitioners, visibleColumnIds]);

  const visiblePractitioners = useMemo(
    () =>
      visibleColumnIds === null
        ? practitioners
        : practitioners.filter((p) => visibleColumnIds.has(p.id)),
    [practitioners, visibleColumnIds],
  );

  const gridQuery = useCalendarGrid({
    calendarIds,
    from: range.from,
    to: range.to,
    enabled: calendarIds.length > 0,
  });

  // In day view multi-column mode, effectiveId is still used for single-col
  // week view and for the block create/edit sheet.
  const effectiveId =
    selectedId && calendarIds.includes(selectedId) ? selectedId : calendarIds[0] ?? null;

  const day = useMemo(() => {
    const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === effectiveId);
    return calendar?.dates.find((d) => d.date === anchor) ?? null;
  }, [gridQuery.data, effectiveId, anchor]);

  // Breaks/blocks for the visible range — rendered as non-bookable overlays.
  const blocksQuery = useCalendarBlocks(range.from, range.to);

  /** Build per-practitioner day blocks for a given calendarId and date. */
  const getDayBlocks = useCallback(
    (calId: string, dateStr: string) => {
      const rows = blocksQuery.data?.blocks ?? [];
      const oneOff = rows
        .filter(
          (b) =>
            (b.practitioner_id ?? b.calendar_id) === calId &&
            b.block_date === dateStr &&
            !b.class_instance_id,
        )
        .map((b) => ({
          id: b.id,
          start: b.start_time,
          end: b.end_time,
          label: b.reason,
          isEditable: true as const,
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
      const breaks = breakRanges.map((range, index) => ({
        id: `break-${calId}-${index}`,
        start: range.start,
        end: range.end,
        label: 'Break',
        isEditable: false as const,
      }));

      return [...oneOff, ...breaks];
    },
    [blocksQuery.data, practitioners],
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

  /** Status counts for the filter bar — across the currently-viewed columns on the anchor date. */
  const filterCounts = useMemo(() => {
    const tally: Partial<Record<CalendarStatusFilter, number>> = {};
    for (const cal of gridQuery.data?.calendars ?? []) {
      if (!visibleColumnIds?.has(cal.calendarId) && visibleColumnIds !== null) continue;
      const dateData = cal.dates.find((d) => d.date === anchor);
      if (!dateData) continue;
      for (const b of dateData.bookings) {
        const s = b.status as CalendarStatusFilter;
        tally[s] = (tally[s] ?? 0) + 1;
      }
    }
    return tally;
  }, [gridQuery.data, anchor, visibleColumnIds]);

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

  // Tap a block → full booking detail
  const openDetail = useCallback((id: string) => setDetailBookingId(id), []);

  const createAt = useCallback(
    (time: string, calId?: string) => {
      const practitionerId = calId ?? effectiveId ?? '';
      // Show action sheet: New booking or Block time
      Alert.alert('Add to calendar', `At ${time}`, [
        {
          text: 'New booking',
          onPress: () => {
            router.push({
              pathname: '/booking/new',
              params: { date: anchor, practitionerId, time },
            });
          },
        },
        {
          text: 'Block time',
          onPress: () => {
            setBlockTarget({
              mode: 'create',
              practitionerId,
              date: anchor,
              startTime: time,
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [router, anchor, effectiveId],
  );

  const startReschedule = useCallback(
    (bookingId: string) => {
      // Search across all calendar columns for this booking
      for (const cal of gridQuery.data?.calendars ?? []) {
        const dateData = cal.dates.find((d) => d.date === anchor);
        if (!dateData) continue;
        const booking = dateData.bookings.find((b) => b.id === bookingId);
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
          return;
        }
      }
    },
    [gridQuery.data, anchor],
  );

  // ---- Drag-to-reschedule ----
  //
  // Pattern: store the pending drag parameters in a ref, update `dragBookingId`
  // state so the mutation re-creates with the right API path, then commit via
  // useEffect once React has re-rendered with the updated mutation function.
  type DragPending = {
    bookingId: string;
    input: { date: string; time: string; durationMinutes?: number };
    previousTarget: RescheduleTarget;
    durationChanged: boolean;
  };
  const pendingDragRef = useRef<DragPending | null>(null);

  // useEffect fires after the render triggered by setDragBookingId, at which
  // point dragRescheduleMutation.mutate uses the correct booking id closure.
  useEffect(() => {
    const pending = pendingDragRef.current;
    if (!pending || dragBookingId !== pending.bookingId) return;
    pendingDragRef.current = null;
    const { input, previousTarget, durationChanged } = pending;
    dragRescheduleMutation.mutate(input, {
      onSuccess: () => {
        hapticSuccess();
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          next.delete(dragBookingId);
          return next;
        });
        showUndo(previousTarget, { durationChanged });
      },
      onError: (error) => {
        hapticWarning();
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          next.delete(dragBookingId);
          return next;
        });
        Alert.alert(
          durationChanged ? 'Resize failed' : 'Reschedule failed',
          error instanceof ApiError
            ? error.message
            : durationChanged
              ? 'Could not change duration. Try again.'
              : 'Could not reschedule. Try another time.',
        );
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when dragBookingId changes
  }, [dragBookingId]);

  /** Helper: look up a booking across all calendar columns on the anchor date. */
  function findBookingOnAnchor(bookingId: string) {
    for (const cal of gridQuery.data?.calendars ?? []) {
      const dateData = cal.dates.find((d) => d.date === anchor);
      if (!dateData) continue;
      const booking = dateData.bookings.find((b) => b.id === bookingId);
      if (booking) return booking;
    }
    return null;
  }

  const handleDragReschedule = useCallback(
    (bookingId: string, newTime: string) => {
      const booking = findBookingOnAnchor(bookingId);
      const guestName = booking?.guestName ?? 'booking';
      const previousTime = booking?.startTime ?? '';

      // Suppress no-op drags.
      if (!booking || newTime === previousTime.slice(0, 5)) return;

      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      const previousDuration = end != null && end > start ? end - start : null;

      const previousTarget: RescheduleTarget = {
        id: bookingId,
        guestName,
        date: anchor,
        time: previousTime,
        durationMinutes: previousDuration,
      };

      hapticSelect();
      setPendingActionIds((prev) => new Set([...prev, bookingId]));

      // Queue the mutation and update the id so useEffect fires it.
      pendingDragRef.current = {
        bookingId,
        input: { date: anchor, time: `${newTime}:00` },
        previousTarget,
        durationChanged: false,
      };
      setDragBookingId(bookingId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- findBookingOnAnchor reads gridQuery/anchor via closure
    [gridQuery.data, anchor],
  );

  const handleDragResize = useCallback(
    (bookingId: string, newDurationMinutes: number) => {
      const booking = findBookingOnAnchor(bookingId);
      if (!booking) return;

      const guestName = booking.guestName;
      const previousTime = booking.startTime;
      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      const previousDuration = end != null && end > start ? end - start : null;

      const previousTarget: RescheduleTarget = {
        id: bookingId,
        guestName,
        date: anchor,
        time: previousTime,
        durationMinutes: previousDuration,
      };

      hapticSelect();
      setPendingActionIds((prev) => new Set([...prev, bookingId]));

      pendingDragRef.current = {
        bookingId,
        input: {
          date: anchor,
          time: `${previousTime.slice(0, 5)}:00`,
          durationMinutes: newDurationMinutes,
        },
        previousTarget,
        durationChanged: true,
      };
      setDragBookingId(bookingId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- findBookingOnAnchor reads gridQuery/anchor via closure
    [gridQuery.data, anchor],
  );

  const handleBlockTimeBlockPress = useCallback(
    (blockId: string) => {
      const rows = blocksQuery.data?.blocks ?? [];
      const block = rows.find((b) => b.id === blockId);
      if (!block) return;
      setBlockTarget({
        mode: 'edit',
        blockId: block.id,
        practitionerId: block.practitioner_id ?? block.calendar_id ?? '',
        date: block.block_date,
        startTime: block.start_time,
        endTime: block.end_time,
        reason: block.reason,
      });
    },
    [blocksQuery.data],
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
            setPendingActionIds((prev) => {
              const next = new Set(prev);
              next.delete(bookingId);
              return next;
            });
          },
          onError: (error) => {
            hapticWarning();
            setPendingActionIds((prev) => {
              const next = new Set(prev);
              next.delete(bookingId);
              return next;
            });
            Alert.alert(
              'Update failed',
              error instanceof ApiError ? error.message : 'Could not update booking.',
            );
          },
        },
      );
    },
    [calendarStatusAction],
  );

  const handleArrivalToggle = useCallback(
    (bookingId: string, arrived: boolean) => {
      setPendingActionIds((prev) => new Set([...prev, bookingId]));
      calendarArrivalAction.mutate(
        { bookingId, client_arrived: arrived },
        {
          onSuccess: () => {
            hapticSuccess();
            setPendingActionIds((prev) => {
              const next = new Set(prev);
              next.delete(bookingId);
              return next;
            });
          },
          onError: (error) => {
            hapticWarning();
            setPendingActionIds((prev) => {
              const next = new Set(prev);
              next.delete(bookingId);
              return next;
            });
            Alert.alert(
              'Update failed',
              error instanceof ApiError ? error.message : 'Could not update attendance.',
            );
          },
        },
      );
    },
    [calendarArrivalAction],
  );

  // ---- Column visibility ----

  const toggleColumn = useCallback(
    (id: string) => {
      hapticSelect();
      setVisibleColumnIds((prev) => {
        const base = prev ?? new Set(calendarIds);
        const next = new Set(base);
        if (next.has(id) && next.size > 1) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [calendarIds],
  );

  const showAllColumns = useCallback(() => {
    setVisibleColumnIds(new Set(calendarIds));
  }, [calendarIds]);

  // ---- Day view — multi-column vs single-column ----

  const isDayMultiColumn = scope === 'day' && visiblePractitioners.length > 1;

  /** Build column data for the multi-column grid on the anchor date. */
  const multiColumnData = useMemo(() => {
    if (!isDayMultiColumn) return [];
    return visiblePractitioners.map((p) => {
      const calData = gridQuery.data?.calendars.find((c) => c.calendarId === p.id);
      const dateData = calData?.dates.find((d) => d.date === anchor);
      const rawBookings = dateData?.bookings ?? [];
      return {
        calendarId: p.id,
        calendarName: p.name,
        bookings: applyStatusFilter(rawBookings, statusFilter),
        workingHours: dateData?.workingHours ?? [],
        timeBlocks: getDayBlocks(p.id, anchor),
      };
    });
  }, [
    isDayMultiColumn,
    visiblePractitioners,
    gridQuery.data,
    anchor,
    statusFilter,
    getDayBlocks,
  ]);

  /** Single-column day view (also used for week sub-grid). */
  const singleColBookings = useMemo(() => {
    const raw = day?.bookings ?? [];
    return applyStatusFilter(raw, statusFilter);
  }, [day, statusFilter]);

  const dayBlocks = useMemo(
    () => getDayBlocks(effectiveId ?? '', anchor),
    [getDayBlocks, effectiveId, anchor],
  );

  // Per-booking compliance flags for the visible day — a small corner dot on
  // each block. Gated on the compliance feature flag so non-compliance venues
  // never hit the endpoint. Built from unfiltered ids so the status filter
  // doesn't churn the query key.
  const visibleBookingIds = useMemo(() => {
    const ids: string[] = [];
    const wanted =
      scope === 'day'
        ? new Set(visiblePractitioners.map((p) => p.id))
        : new Set(effectiveId ? [effectiveId] : []);
    for (const cal of gridQuery.data?.calendars ?? []) {
      if (!wanted.has(cal.calendarId)) continue;
      const dateData = cal.dates.find((d) => d.date === anchor);
      if (dateData) for (const b of dateData.bookings) ids.push(b.id);
    }
    return ids;
  }, [gridQuery.data, scope, visiblePractitioners, effectiveId, anchor]);

  const complianceFlagsQuery = useComplianceBookingFlags(
    complianceEnabled ? visibleBookingIds : [],
  );
  const complianceFlags = complianceFlagsQuery.data?.flags;

  const singleDayGrid = (
    <CalendarDayGrid
      bookings={singleColBookings}
      workingHours={day?.workingHours ?? []}
      timeBlocks={dayBlocks}
      nowMinutes={nowMinutes}
      onBlockPress={openDetail}
      onBlockLongPress={startReschedule}
      onStatusChange={handleStatusChange}
      onArrivalToggle={handleArrivalToggle}
      pendingActionIds={pendingActionIds}
      complianceFlags={complianceFlags}
      onEmptyPress={(time) => createAt(time, effectiveId ?? undefined)}
      onBlockTimeBlockPress={handleBlockTimeBlockPress}
      onDragReschedule={handleDragReschedule}
      onDragResize={handleDragResize}
    />
  );

  // ---- FAB — shows new booking + walk-in action sheet ----

  const handleFabPress = useCallback(() => {
    const nowTime = nowMinutes != null
      ? `${String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`
      : '12:00';
    Alert.alert('Add booking', undefined, [
      {
        text: newBookingActionLabel(terminology),
        onPress: () => router.push('/booking/new'),
      },
      {
        text: 'Walk-in',
        onPress: () =>
          router.push({
            pathname: '/booking/new',
            params: { date: anchor, time: nowTime, isWalkIn: '1' },
          }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [router, anchor, nowMinutes, terminology]);

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

            {/* Practitioner chips — day mode shows a column-visibility icon; week shows single-select. */}
            {scope !== 'month' ? (
              <View style={styles.chipRow}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}>
                  {scope === 'day' ? (
                    // Multi-column day: chips are visibility toggles
                    visiblePractitioners.length < practitioners.length ? (
                      <Chip
                        label={`${visiblePractitioners.length}/${practitioners.length} shown`}
                        selected={false}
                        onPress={() => setColumnSheetVisible(true)}
                      />
                    ) : null
                  ) : (
                    // Week view: single select (existing behaviour)
                    practitioners.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.name}
                        selected={p.id === effectiveId}
                        onPress={() => setSelectedId(p.id)}
                      />
                    ))
                  )}
                </ScrollView>

                {scope === 'day' ? (
                  <Pressable
                    onPress={() => setColumnSheetVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Show/hide practitioners"
                    hitSlop={8}
                    style={({ pressed }) => [styles.colVisBtn, { opacity: pressed ? 0.6 : 1 }]}>
                    <SymbolView
                      name={{ ios: 'person.2.fill', android: 'people', web: 'people' }}
                      tintColor={colors.brand}
                      size={18}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Status filter — shown on day/week when there are bookings */}
          {scope !== 'month' ? (
            <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
              <StatusFilterBar
                selected={statusFilter}
                onChange={setStatusFilter}
                counts={filterCounts}
              />
            </View>
          ) : null}

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
              {singleDayGrid}
            </View>
          ) : isDayMultiColumn ? (
            <MultiColumnDayGrid
              columns={multiColumnData}
              nowMinutes={nowMinutes}
              onBlockPress={openDetail}
              onBlockLongPress={startReschedule}
              onStatusChange={handleStatusChange}
              onArrivalToggle={handleArrivalToggle}
              pendingActionIds={pendingActionIds}
              complianceFlags={complianceFlags}
              onEmptyPress={(calId, time) => createAt(time, calId)}
              onBlockTimeBlockPress={handleBlockTimeBlockPress}
              onDragReschedule={handleDragReschedule}
              onDragResize={handleDragResize}
            />
          ) : (
            singleDayGrid
          )}

          <Fab
            accessibilityLabel={newBookingActionLabel(terminology)}
            onPress={handleFabPress}
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
      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />
      <BlockEditSheet
        target={blockTarget}
        onClose={() => setBlockTarget(null)}
      />
      <ColumnVisibilitySheet
        visible={columnSheetVisible}
        onClose={() => setColumnSheetVisible(false)}
        practitioners={practitioners}
        visibleIds={visibleColumnIds ?? new Set(calendarIds)}
        onToggle={toggleColumn}
        onShowAll={showAllColumns}
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
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  colVisBtn: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekBody: {
    flex: 1,
  },
  weekStripWrap: {
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
