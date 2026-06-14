import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { format, parseISO } from 'date-fns';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { AllCalendarsDayGrid } from '@/components/calendar/AllCalendarsDayGrid';
import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekGrid, type WeekDayColumn } from '@/components/calendar/WeekGrid';
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

/**
 * Viewport width (dp) at/above which the DAY view shows every practitioner's
 * column side-by-side (multi-calendar grid) instead of one practitioner at a
 * time. Tablets and landscape phones clear this; phone-portrait stays single.
 */
const WIDE_DAY_MIN_WIDTH = 700;
/**
 * Landscape phones can be narrower than a tablet but still wide enough for a few
 * columns: treat "landscape AND at least this wide" as a wide viewport too.
 */
const WIDE_LANDSCAPE_MIN_WIDTH = 600;

/** True on a tablet, or a landscape phone wide enough for multiple columns. */
function isWideDayViewport(width: number, height: number): boolean {
  return width >= WIDE_DAY_MIN_WIDTH || (width > height && width >= WIDE_LANDSCAPE_MIN_WIDTH);
}

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
  // Multi-calendar "move to practitioner" chooser — set by a long-press on a
  // block in the side-by-side day grid. Carries the booking + its current
  // column so the chooser can offer the OTHER practitioners.
  const [reassignTarget, setReassignTarget] = useState<{
    bookingId: string;
    fromPractitionerId: string;
  } | null>(null);

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

  // Wide viewport (tablet / landscape) → the DAY view shows every practitioner
  // side-by-side automatically, so the columns are visible without picking the
  // "All" chip. Phone-portrait is unaffected (stays single-practitioner).
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWideViewport = isWideDayViewport(windowWidth, windowHeight);

  // The calendar being viewed — one at a time, switched via the chips row, OR
  // the 'all' multi-calendar day view. null falls back to the first calendar.
  const isAllView =
    selectedId === ALL_CALENDARS && scope === 'day' && practitioners.length > 1;
  // Render the multi-practitioner columns when the user explicitly picks "All",
  // OR when a wide viewport makes the side-by-side day layout the default. Both
  // require day scope and more than one practitioner.
  const showAllCalendars =
    scope === 'day' &&
    practitioners.length > 1 &&
    (isAllView || isWideViewport);
  const effectiveId =
    selectedId && selectedId !== ALL_CALENDARS && calendarIds.includes(selectedId)
      ? selectedId
      : calendarIds[0] ?? null;

  // The calendar-switcher chips let you pick one practitioner (or "All"). On a
  // wide DAY viewport every column already shows side-by-side, so the switcher
  // is redundant there and its selected-state would be misleading — hide it.
  // Week scope always keeps it (it chooses whose week renders).
  const showSwitcher =
    practitioners.length > 1 &&
    scope !== 'month' &&
    !(scope === 'day' && isWideViewport);

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
  // The now-line ticks while today is in view: the anchor day in day/month
  // scope, or any day of the visible week in week scope.
  const nowActive = scope === 'week' ? week.days.includes(today) : isToday;
  const nowMinutes = useNowMinutes(timeZone, nowActive);

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

  /** Empty-slot tap in the week grid — re-anchor to that day (keeps the same
   *  week), then open the add sheet (the booking flow reads the anchor date). */
  const createAtForDate = useCallback(
    (date: string, time: string) => {
      setAnchor(date);
      setAddSheetTarget({ kind: 'slot', time, practitionerId: effectiveId ?? '' });
    },
    [effectiveId],
  );

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

  // ---- Cross-practitioner reassignment (multi-calendar long-press) ----
  //
  // Long-press a block in the side-by-side day grid → open a "move to
  // practitioner" chooser. The PATCH keeps the same date/time and just changes
  // the practitioner/calendar; the server re-validates the slot on the TARGET
  // and 409s on a hard conflict, which we surface + leave the grid untouched
  // (no optimistic grid mutation, so an error needs no manual rollback — the
  // grid is a pure render of unchanged query data). Success invalidates
  // calendar.all()/bookings.all() via the mutation, and an Undo moves it back.
  const handleBlockLongPress = useCallback(
    (bookingId: string, fromPractitionerId: string) => {
      // Nothing to choose if there's only one practitioner.
      if (practitioners.length <= 1) return;
      hapticSelect();
      setReassignTarget({ bookingId, fromPractitionerId });
    },
    [practitioners.length],
  );

  const closeReassign = useCallback(() => setReassignTarget(null), []);

  // The Undo on a successful reassign re-runs the move back to the original
  // column. To avoid a self-referential callback (a hooks-rule violation), the
  // Undo dispatches through a ref that always points at the latest commit.
  const commitReassignRef = useRef<
    ((bookingId: string, toPractitionerId: string, undoTo: string | null) => void) | null
  >(null);

  const commitReassign = useCallback(
    (bookingId: string, toPractitionerId: string, undoTo: string | null) => {
      const booking = findBookingOnAnchor(bookingId);
      if (!booking) {
        toast.error('Could not find that booking. Pull to refresh.');
        return;
      }
      const toName =
        practitioners.find((p) => p.id === toPractitionerId)?.name ?? 'practitioner';
      setPendingActionIds((prev) => new Set([...prev, bookingId]));
      rescheduleById.mutate(
        {
          bookingId,
          date: anchor,
          // Reassign keeps the slot — send the booking's current start time.
          time: `${booking.startTime.slice(0, 5)}:00`,
          practitionerId: toPractitionerId,
        },
        {
          onSuccess: () => {
            hapticSuccess();
            removePending(bookingId);
            toast.show({
              message: `Moved ${booking.guestName ?? 'booking'} to ${toName}`,
              // Offer an Undo back to the original column (when known). The undo
              // itself offers no further undo (undoTo: null).
              ...(undoTo
                ? {
                    actionLabel: 'Undo',
                    onAction: () => commitReassignRef.current?.(bookingId, undoTo, null),
                  }
                : {}),
            });
          },
          onError: (error) => {
            removePending(bookingId);
            toast.error(
              error instanceof ApiError
                ? error.message
                : `Could not move to ${toName}. That slot may be taken.`,
            );
          },
        },
      );
    },
    [findBookingOnAnchor, practitioners, anchor, rescheduleById, removePending, toast],
  );

  // Keep the ref pointed at the latest commit so the Undo dispatches correctly.
  useEffect(() => {
    commitReassignRef.current = commitReassign;
  }, [commitReassign]);

  const handleReassignPick = useCallback(
    (toPractitionerId: string) => {
      const target = reassignTarget;
      closeReassign();
      if (!target) return;
      commitReassign(target.bookingId, toPractitionerId, target.fromPractitionerId);
    },
    [reassignTarget, closeReassign, commitReassign],
  );

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

  // ---- Multi-calendar day view data ----
  // One column per practitioner for the anchor date, sharing the time gutter.
  // Assembled whenever the side-by-side grid will render (explicit "All" chip
  // OR a wide viewport).
  const allCalendarsForDay = useMemo(() => {
    if (!showAllCalendars) return [];
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
  }, [showAllCalendars, practitioners, gridQuery.data, anchor, getDayBlocks]);

  // ---- Week view data ----
  // Seven day-columns for the SELECTED calendar (one practitioner's week).
  const weekColumns = useMemo<WeekDayColumn[]>(() => {
    if (scope !== 'week') return [];
    const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === effectiveId);
    const byDate = new Map((calendar?.dates ?? []).map((d) => [d.date, d]));
    return week.days.map((date) => {
      const data = byDate.get(date) ?? null;
      const d = parseISO(`${date}T12:00:00.000Z`);
      const weekday = d.getDay();
      return {
        date,
        weekdayLabel: format(d, 'EEE'),
        dayNumber: format(d, 'd'),
        isToday: date === today,
        isWeekend: weekday === 0 || weekday === 6,
        workingHours: data?.workingHours ?? [],
        bookings: data?.bookings ?? [],
        sessions: data?.sessions ?? [],
      };
    });
  }, [scope, gridQuery.data, effectiveId, week.days, today]);

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

  // ---- "Move to practitioner" chooser content ----
  // The booking being moved + the OTHER practitioners it can move to.
  const reassignBooking = useMemo(
    () => (reassignTarget ? findBookingOnAnchor(reassignTarget.bookingId) : null),
    [reassignTarget, findBookingOnAnchor],
  );
  const reassignOptions = useMemo(
    () =>
      reassignTarget
        ? practitioners.filter((p) => p.id !== reassignTarget.fromPractitionerId)
        : [],
    [reassignTarget, practitioners],
  );

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
                (day scope only) that shows every calendar side-by-side. Hidden
                on a wide day viewport where all columns already show. */}
            {showSwitcher ? (
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
              <WeekGrid
                days={weekColumns}
                nowMinutes={nowMinutes}
                onBlockPress={openDetail}
                onEmptyPress={createAtForDate}
                onDayPress={(date) => {
                  hapticSelect();
                  setAnchor(date);
                  setScope('day');
                }}
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            </View>
          ) : showAllCalendars ? (
            <View style={styles.weekBody}>
              <AllCalendarsDayGrid
                calendars={allCalendarsForDay}
                nowMinutes={nowMinutes}
                onBlockPress={openDetail}
                onEmptyPress={createAtFor}
                onBlockLongPress={handleBlockLongPress}
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

      {/* "Move to practitioner" chooser — opened by a long-press on a block in
          the side-by-side day grid. Picking a practitioner PATCHes the
          reassignment (optimistic pending + rollback + Undo toast). */}
      <Sheet visible={reassignTarget !== null} onClose={closeReassign}>
        <Text variant="subheading">
          {reassignBooking
            ? `Move ${reassignBooking.guestName}`
            : 'Move to practitioner'}
        </Text>
        <Text variant="caption" tone="muted">
          {reassignBooking
            ? `${reassignBooking.startTime.slice(0, 5)} · keeps the same time`
            : 'Choose a practitioner to move this booking to.'}
        </Text>
        <View style={styles.reassignList}>
          {reassignOptions.length === 0 ? (
            <Text variant="body" tone="muted">
              No other practitioners to move to.
            </Text>
          ) : (
            reassignOptions.map((p) => (
              <Button
                key={p.id}
                label={p.name}
                variant="secondary"
                fullWidth
                onPress={() => handleReassignPick(p.id)}
              />
            ))
          )}
          <Button label="Cancel" variant="ghost" fullWidth onPress={closeReassign} />
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
  reassignList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
