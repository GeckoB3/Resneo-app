import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { useReduceMotion, motionSafe } from '@/lib/motion';
import { SymbolView } from 'expo-symbols';
import { format, parseISO } from 'date-fns';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { AllCalendarsDayGrid } from '@/components/calendar/AllCalendarsDayGrid';
import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { venueDayHours } from '@/lib/calendar/venue-closures';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { MonthPickerSheet } from '@/components/calendar/MonthPickerSheet';
import { type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekGrid, type WeekDayColumn } from '@/components/calendar/WeekGrid';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { IconButton } from '@/components/ui/IconButton';
import { LiveDot } from '@/components/ui/LiveDot';
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
import {
  useNotifyBookingModification,
  useRescheduleBookingById,
} from '@/lib/queries/useBookingMutations';
import {
  useCalendarStatusAction,
  useCalendarArrivalAction,
} from '@/lib/queries/useCalendarQuickActions';
import { useCalendarGrid } from '@/lib/queries/useCalendarGrid';
import { useComplianceBookingFlags } from '@/lib/queries/useCompliance';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useSchedule } from '@/lib/queries/useSchedule';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { LinkedBookingCreateSheet } from '@/components/linked/LinkedBookingCreateSheet';
import { LinkedBookingDetailSheet } from '@/components/linked/LinkedBookingDetailSheet';
import { LinkedBookingEditSheet } from '@/components/linked/LinkedBookingEditSheet';
import { LinkedVenueCalendarGrid } from '@/components/linked/LinkedVenueCalendarGrid';
import { useLinkedCalendar } from '@/lib/queries/useLinkedCalendar';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import type { CalendarGridBooking, CalendarGridDay } from '@/types/calendar-grid';
import type { Practitioner } from '@/types/practitioner';
import type { CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';
import type { CalendarScheduleBlock, ScheduleBlockDTO } from '@/types/schedule-blocks';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';

type Scope = 'day' | 'week' | 'month';

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** Active linked-venue sheet (view/edit/create a cross-venue booking). */
type LinkedSheet =
  | { kind: 'view'; booking: LinkedBooking }
  | { kind: 'edit'; booking: LinkedBooking }
  | { kind: 'create' }
  | null;

// NOTE: the calendar diary intentionally has NO status-filter pill row
// (All / Pending / Booked / Confirmed / Started / Completed / No-Show). The
// diary shows the day's real schedule; status filtering belongs on the Bookings
// tab, not here. Do not re-add a CALENDAR_STATUS_FILTERS row to this page.

/**
 * Statuses whose bookings may be hold-dragged / resized (web parity:
 * Pending|Booked|Confirmed|Seated — surfaced as "Started" in the UI). A
 * Completed/No-Show/Cancelled booking is never movable; the drag handlers
 * refuse it up front and the block's gesture is disabled to match.
 */
const MOVABLE_BOOKING_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

/**
 * A grid booking is movable when its status is in the movable set and it is not
 * a resource booking. The calendar-grid payload doesn't type a `resource_id`
 * (resource bookings reach the grid as read-only schedule blocks, never as
 * draggable appointment bars), so the resource check is a defensive runtime
 * read that stays correct if the payload ever carries one.
 */
function isMovableBooking(booking: CalendarGridBooking): boolean {
  if (!MOVABLE_BOOKING_STATUSES.has(booking.status)) return false;
  const resourceId = (booking as { resource_id?: string | null }).resource_id;
  return resourceId == null;
}

/** Minimal horizontal-swipe distance (dp) to step a day/week — web parity feel. */
const SWIPE_STEP_THRESHOLD = 56;

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

// ---------------------------------------------------------------------------
// Schedule feed -> calendar overlay blocks
//
// GET /api/venue/schedule returns a FLAT, venue-wide ScheduleBlockDTO[] for
// CLASSES, EVENTS and RESOURCE bookings. This feed is DISJOINT from the grid's
// `sessions`/event_sessions (the web draws the calendar's class/event capacity
// blocks from THIS feed), so rendering both never double-counts.
//
// Class sessions arrive denormalised: one `ci-*` block per empty session AND
// one `bk-*` block PER BOOKING for booked sessions (same as useClassSchedule's
// dedupe). We collapse those to ONE block per class_instance so a busy class
// doesn't stack N identical overlays. Events are already one row per event;
// resource bookings are one row per booking (kept as-is).
// ---------------------------------------------------------------------------

/** Default accent per kind when the DTO carries no `accent_colour`. */
const KIND_ACCENT: Record<ScheduleBlockDTO['kind'], string> = {
  class_session: '#22C55E', // green
  event_ticket: '#F59E0B', // amber
  resource_booking: '#64748B', // slate
};

/** Kind-specific capacity / uptake line (null when not applicable). */
function capacityLabelFor(dto: ScheduleBlockDTO): string | null {
  if (dto.kind === 'class_session') {
    return dto.class_capacity != null
      ? `${dto.class_booked_spots ?? 0}/${dto.class_capacity} booked`
      : null;
  }
  if (dto.kind === 'event_ticket') {
    if (dto.event_capacity != null) {
      return `${dto.event_party_total ?? dto.event_booking_count ?? 0}/${dto.event_capacity}`;
    }
    return dto.event_booking_count != null ? `${dto.event_booking_count} booked` : null;
  }
  // resource_booking
  return dto.subtitle ?? null;
}

/** Normalize a raw DTO into the render-ready overlay block. */
function toCalendarScheduleBlock(dto: ScheduleBlockDTO): CalendarScheduleBlock {
  return {
    id: dto.id,
    kind: dto.kind,
    startTime: dto.start_time,
    endTime: dto.end_time,
    title: dto.title,
    subtitle: dto.subtitle ?? null,
    accent: dto.accent_colour || KIND_ACCENT[dto.kind],
    capacityLabel: capacityLabelFor(dto),
  };
}

/**
 * Collapse the feed to one block per class_instance (richest booked-count wins,
 * mirroring useClassSchedule.dedupeClassSessions) so a busy class doesn't stack
 * N identical overlays. Events/resources pass through untouched.
 */
function dedupeScheduleDTOs(blocks: ScheduleBlockDTO[]): ScheduleBlockDTO[] {
  const classByInstance = new Map<string, ScheduleBlockDTO>();
  const passthrough: ScheduleBlockDTO[] = [];
  for (const block of blocks) {
    if (block.kind === 'class_session' && block.class_instance_id) {
      const existing = classByInstance.get(block.class_instance_id);
      const score = block.class_booked_spots ?? -1;
      const existingScore = existing ? existing.class_booked_spots ?? -1 : -2;
      if (!existing || score > existingScore) {
        classByInstance.set(block.class_instance_id, block);
      }
    } else {
      passthrough.push(block);
    }
  }
  return [...classByInstance.values(), ...passthrough];
}

/** Stable map key for a calendar column + date. */
function scheduleKey(calendarId: string, date: string): string {
  return `${calendarId} ${date}`;
}

/**
 * Group blocks by `${calendarId} ${date}` (see {@link scheduleKey}) so each
 * calendar column on a given date gets its own normalized list. Class
 * instances are deduped first; events/resources pass through.
 *
 * Blocks with a null/missing `calendar_id` have no column to attach to (the web
 * only renders staff columns), so they're dropped here -- the key never matches
 * a real column. We count + log the omission (dev only) so it's visible during
 * the device-gated QA rather than silent.
 */
function groupScheduleByCalendarDate(
  blocks: ScheduleBlockDTO[],
): Map<string, CalendarScheduleBlock[]> {
  const map = new Map<string, CalendarScheduleBlock[]>();
  let droppedNoColumn = 0;
  for (const dto of dedupeScheduleDTOs(blocks)) {
    if (!dto.calendar_id) {
      // No staff column to attach to, so it can't render (matches the web,
      // which only shows staff columns). Counted + logged below for device QA.
      droppedNoColumn += 1;
      continue;
    }
    const key = scheduleKey(dto.calendar_id, dto.date);
    const list = map.get(key) ?? [];
    list.push(toCalendarScheduleBlock(dto));
    map.set(key, list);
  }
  if (droppedNoColumn > 0 && __DEV__) {
    console.log(
      `[calendar] skipped ${droppedNoColumn} schedule block(s) with no calendar_id (no column to render on).`,
    );
  }
  return map;
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
  const reduceMotion = useReduceMotion();
  const { venue, terminology, featureFlags } = useVenueContext();
  // Weekly venue opening hours → drives the "Closed" shading on the grids.
  const openingHours = venue?.opening_hours ?? null;
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
  // Month-picker sheet (date jump) — opened by tapping the header date label.
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
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
  // Sends the deferred "booking changed" email when the user taps Notify.
  const notifyModification = useNotifyBookingModification();

  // After a drag move/resize, prompt to notify the guest (or undo) — the server
  // notification is deferred so the staff member chooses. Null when not showing.
  const [moveNotice, setMoveNotice] = useState<{
    bookingId: string;
    guestName: string;
    previous: RescheduleTarget;
    durationChanged: boolean;
  } | null>(null);

  // Restore a booking to its previous slot AND length. Sends the original end so
  // the revert validates the true span, and defers the email (an undone change
  // shouldn't notify the guest).
  const undoReschedule = useCallback(
    (previous: RescheduleTarget) => {
      const endTime =
        previous.durationMinutes != null
          ? `${minutesToTime(timeToMinutes(previous.time) + previous.durationMinutes)}:00`
          : undefined;
      rescheduleById.mutate({
        bookingId: previous.id,
        date: previous.date,
        time: `${previous.time.slice(0, 5)}:00`,
        ...(endTime ? { endTime } : {}),
        deferGuestNotification: true,
      });
    },
    [rescheduleById],
  );

  const closeMoveNotice = useCallback(() => setMoveNotice(null), []);

  const handleNotifyMove = useCallback(() => {
    if (!moveNotice) return;
    const name = moveNotice.guestName;
    notifyModification.mutate(
      { bookingId: moveNotice.bookingId },
      {
        onSuccess: () => toast.success(`${name} notified of the change.`),
        onError: () => toast.error('Could not notify the guest.'),
      },
    );
    setMoveNotice(null);
  }, [moveNotice, notifyModification, toast]);

  const handleUndoMove = useCallback(() => {
    if (!moveNotice) return;
    undoReschedule(moveNotice.previous);
    setMoveNotice(null);
  }, [moveNotice, undoReschedule]);

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

  // ---- Linked venues (cross-venue calendars) ----
  // Any accepted link that shares calendar visibility surfaces as a chip in the
  // switcher row; picking one sets ownerVenueId and renders that venue's day via
  // LinkedVenueCalendarGrid (grant-gated). ownerVenueId persists across launches.
  const { ownerVenueId, setOwnerVenueId, clearOwnerVenue, reconcileOwnerVenue } =
    useLinkedVenueContext();
  const linkedQuery = useLinkedCalendar({ from: anchor, to: anchor });
  const linkedVenues = useMemo<LinkedVenueCalendar[]>(
    () => linkedQuery.data?.venues ?? [],
    [linkedQuery.data?.venues],
  );
  const isLinkedActive = !!ownerVenueId;
  const activeLinkedVenue = useMemo(
    () => (ownerVenueId ? linkedVenues.find((v) => v.venueId === ownerVenueId) ?? null : null),
    [ownerVenueId, linkedVenues],
  );

  // Validate a persisted linked selection against the live feed: if a link was
  // revoked/suspended/deleted while the app was closed, the venue drops out of
  // the linked-calendar response and we clear the stale context (falling back to
  // the primary venue) rather than querying a venue we can no longer see. The
  // feed lists every accessible linked venue regardless of bookings, so a quiet
  // day is not mistaken for a lost link. `reconcileOwnerVenue` re-keys on
  // `ownerVenueId`, so this also runs once hydration restores the saved id.
  useEffect(() => {
    if (!linkedQuery.isSuccess) return;
    reconcileOwnerVenue(linkedVenues.map((v) => v.venueId));
  }, [linkedQuery.isSuccess, linkedVenues, reconcileOwnerVenue]);

  const [linkedSheet, setLinkedSheet] = useState<LinkedSheet>(null);

  const gridQuery = useCalendarGrid({
    calendarIds,
    from: range.from,
    to: range.to,
    enabled: calendarIds.length > 0,
    // Near-realtime: a second device's changes surface within ~60s (web has
    // live sync; the app polls). Pull-to-refresh forces an immediate refetch.
    refetchInterval: 60_000,
  });

  // Venue-wide CLASS / EVENT / RESOURCE blocks for the visible range, from the
  // /api/venue/schedule feed. Disjoint from the grid's `sessions`, so the
  // calendar renders BOTH without double-counting. Same poll cadence as the
  // grid. Enabled only once we have calendars (a venue with columns).
  const scheduleQuery = useSchedule({
    from: range.from,
    to: range.to,
    enabled: calendarIds.length > 0,
    refetchInterval: 60_000,
  });

  // Group the flat feed by `${calendarId} ${date}` so each calendar column on a
  // given date can pull its own list (class instances deduped; null-column
  // blocks dropped — see groupScheduleByCalendarDate).
  const scheduleByCalendarDate = useMemo(
    () => groupScheduleByCalendarDate(scheduleQuery.data ?? []),
    [scheduleQuery.data],
  );

  // Realtime: a change on another device invalidates the grid promptly instead
  // of waiting for the 60s poll above (which stays as a fallback). Mirrors the
  // web calendar's channel — bookings + calendar blocks scoped to this venue.
  // Refetches both the grid (bookings/blocks/sessions) and the schedule feed
  // (classes/events/resources) so every overlay stays in sync.
  const venueId = venue?.id ?? null;
  const onLiveRefresh = useCallback(() => {
    void gridQuery.refetch();
    void scheduleQuery.refetch();
  }, [gridQuery, scheduleQuery]);

  const liveState = useVenueLiveSync({
    venueId,
    onRefresh: onLiveRefresh,
    subscriptions: venueId
      ? [
          { table: 'bookings', filter: `venue_id=eq.${venueId}` },
          { table: 'calendar_blocks', filter: `venue_id=eq.${venueId}` },
          { table: 'practitioner_calendar_blocks', filter: `venue_id=eq.${venueId}` },
        ]
      : [],
    enabled: !!venueId && calendarIds.length > 0,
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

  // Show the calendar-switcher row whenever there's something to pick: the
  // primary switcher condition above, OR any linked venue exists / is active
  // (so linked calendars are always reachable, even on a single-practitioner or
  // wide-viewport venue where the primary switcher would otherwise hide).
  const hasLinkedVenues = linkedVenues.length > 0 || isLinkedActive;
  const showChips = scope !== 'month' && (hasLinkedVenues || showSwitcher);

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
      const oneOff: CalendarTimeBlock[] = (gridDay?.blocks ?? []).map((b) => {
        // Only plain manual blocks are editable here; breaks, closures and
        // class-session blocks are read-only (mirrors the web's
        // isManualEditableBlock) so a break can't be dragged or deleted from the
        // grid. The type also names the overlay when no reason is set.
        const readOnlyType =
          b.type === 'break' || b.type === 'closed' || b.type === 'class_session';
        const typeLabel =
          b.type === 'break'
            ? 'Break'
            : b.type === 'closed'
              ? 'Closed'
              : b.type === 'class_session'
                ? 'Class'
                : null;
        return {
          id: b.id,
          start: b.startTime,
          end: b.endTime,
          label: b.reason?.trim() || typeLabel,
          isEditable: !readOnlyType,
        };
      });

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

  /**
   * date → total bookings across all calendars (for week strip + month grid).
   * Excludes No-Show so the per-day badge matches the web's
   * buildMonthDayScheduleCounts (which drops Cancelled + No-Show). Cancelled is
   * already absent from the calendar-grid payload, so No-Show is the only filter
   * needed here.
   */
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const calendar of gridQuery.data?.calendars ?? []) {
      for (const d of calendar.dates) {
        const visible = d.bookings.filter((b) => b.status !== 'No-Show').length;
        map[d.date] = (map[d.date] ?? 0) + visible;
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

  // Date jump from the month-picker sheet: anchor to the tapped day in day view
  // (the most useful target for an arbitrary jump) and close the picker.
  const jumpToDate = useCallback((date: string) => {
    hapticSelect();
    setAnchor(date);
    setScope('day');
    setMonthPickerOpen(false);
  }, []);

  // Horizontal swipe on the grid body → prev/next day (day scope) or week (week
  // scope), reusing step(). HORIZONTAL-only: activeOffsetX arms the pan once the
  // finger has moved sideways past the threshold, while failOffsetY yields to a
  // vertical drag so the grid's own vertical scroll still works. The block
  // hold-drag uses failOffsetX([-10,10]) (it only arms after a 500ms hold), so a
  // quick sideways swipe never moves an appointment — it pages the date instead.
  // Direction: swipe LEFT (negative translation) → next; swipe RIGHT → previous.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-14, 14])
        .onEnd((event) => {
          'worklet';
          if (Math.abs(event.translationX) < SWIPE_STEP_THRESHOLD) return;
          runOnJS(step)(event.translationX < 0 ? 1 : -1);
        }),
    [step],
  );

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
      endTime?: string;
      previousTarget: RescheduleTarget;
      durationChanged: boolean;
    }) => {
      setPendingActionIds((prev) => new Set([...prev, input.bookingId]));
      rescheduleById.mutate(
        {
          bookingId: input.bookingId,
          date: anchor,
          time: input.time,
          ...(input.endTime ? { endTime: input.endTime } : {}),
          // Defer the guest email — the move prompt below offers Notify/Skip.
          deferGuestNotification: true,
        },
        {
          onSuccess: () => {
            // Drop haptic already fired in the drag worklet; confirm + prompt.
            removePending(input.bookingId);
            setMoveNotice({
              bookingId: input.bookingId,
              guestName: input.previousTarget.guestName,
              previous: input.previousTarget,
              durationChanged: input.durationChanged,
            });
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
    [anchor, rescheduleById, removePending, toast],
  );

  const handleDragReschedule = useCallback(
    (bookingId: string, newTime: string) => {
      const booking = findBookingOnAnchor(bookingId);
      if (!booking || newTime === booking.startTime.slice(0, 5)) return;
      // Web parity: only Pending|Booked|Confirmed|Seated are movable, and a
      // resource booking is never moved here. The block's gesture is already
      // disabled for these, so this is a defensive backstop.
      if (!isMovableBooking(booking)) return;

      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      const duration = end != null && end > start ? end - start : null;
      // Preserve the duration and pin the validated end to the real bar so the
      // server doesn't fall back to the wider catalogue default (false "Blocked time").
      const endTime =
        duration != null
          ? `${minutesToTime(timeToMinutes(`${newTime}:00`) + duration)}:00`
          : undefined;
      commitDrag({
        bookingId,
        time: `${newTime}:00`,
        ...(endTime ? { endTime } : {}),
        previousTarget: {
          id: bookingId,
          guestName: booking.guestName ?? 'booking',
          date: anchor,
          time: booking.startTime,
          durationMinutes: duration,
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
      // Same movability gate as reschedule (web parity).
      if (!isMovableBooking(booking)) return;

      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      // New end = same start + the resized duration; the server derives the new
      // length from it and validates the true span.
      const endTime = `${minutesToTime(start + newDurationMinutes)}:00`;
      commitDrag({
        bookingId,
        time: `${booking.startTime.slice(0, 5)}:00`,
        endTime,
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
        // This practitioner's class/event/resource blocks for the anchor date.
        scheduleBlocks: scheduleByCalendarDate.get(scheduleKey(p.id, anchor)) ?? [],
      };
    });
  }, [showAllCalendars, practitioners, gridQuery.data, anchor, getDayBlocks, scheduleByCalendarDate]);

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
        // The selected calendar's class/event/resource blocks for this day.
        scheduleBlocks: effectiveId
          ? scheduleByCalendarDate.get(scheduleKey(effectiveId, date)) ?? []
          : [],
        // Venue open/closed state for this day → "Closed" shading.
        venueHours: venueDayHours(openingHours, date),
      };
    });
  }, [scope, gridQuery.data, effectiveId, week.days, today, scheduleByCalendarDate, openingHours]);

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
  // Pull-to-refresh refetches BOTH the grid and the schedule feed so a freshly
  // added class/event/resource surfaces immediately alongside bookings.
  const onRefresh = useCallback(() => {
    void gridQuery.refetch();
    void scheduleQuery.refetch();
  }, [gridQuery, scheduleQuery]);

  // Class/event capacity blocks from the grid payload (rendered indigo).
  const daySessions = useMemo(() => day?.sessions ?? [], [day]);

  // The viewed calendar's class/event/resource blocks (schedule feed) for the
  // anchor date — read-only overlays, disjoint from `daySessions`.
  const daySchedule = useMemo(
    () =>
      effectiveId
        ? scheduleByCalendarDate.get(scheduleKey(effectiveId, anchor)) ?? []
        : [],
    [effectiveId, anchor, scheduleByCalendarDate],
  );

  // Venue open/closed state for the anchor date (shared by the day + all-cal views).
  const venueHoursForAnchor = useMemo(
    () => venueDayHours(openingHours, anchor),
    [openingHours, anchor],
  );

  const dayGrid = (
    <CalendarDayGrid
      // Remount when the viewed calendar or day changes so scroll-to-now
      // re-runs (returning to today / switching practitioner re-scrolls).
      key={`${effectiveId ?? 'none'}:${anchor}`}
      bookings={dayBookings}
      // Drag-conflict math sees the UNFILTERED day so a status-filtered (hidden)
      // booking still blocks an overlapping drop. Sessions + scheduleBlocks are
      // folded in by the grid, so classes/events/resources block too.
      conflictBookings={day?.bookings ?? []}
      workingHours={day?.workingHours ?? []}
      timeBlocks={dayBlocks}
      sessions={daySessions}
      scheduleBlocks={daySchedule}
      venueHours={venueHoursForAnchor}
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
            <View style={styles.scopeRow}>
              <View style={styles.scopeControl}>
                <Segmented
                  value={scope}
                  onChange={(s) => {
                    // Linked calendars are day-only; switching to week/month exits
                    // the linked context back to the primary venue.
                    if (isLinkedActive && s !== 'day') clearOwnerVenue();
                    setScope(s);
                  }}
                  options={SCOPE_OPTIONS}
                />
              </View>
              {/* Realtime indicator — green live / amber reconnecting, hidden when
                  idle (matches Resources/Contacts). Realtime invalidates the grid
                  promptly; the 60s poll is the fallback. */}
              <LiveDot state={liveState} />
            </View>

            <View style={styles.dateNav}>
              <IconButton
                icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
                accessibilityLabel="Previous"
                onPress={() => step(-1)}
              />
              {/* Label flexes, so the Today pill appearing never moves the arrows.
                  Tapping it opens the month-picker sheet to jump to any date; the
                  separate Today pill (shown when off-today) returns to today. */}
              <Pressable
                onPress={() => {
                  hapticSelect();
                  setMonthPickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint="Pick a date to jump to"
                style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
                <Text variant="heading" numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
              {!isToday ? (
                <Animated.View
                  entering={motionSafe(FadeIn.duration(160), reduceMotion)}
                  exiting={motionSafe(FadeOut.duration(120), reduceMotion)}>
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
            {showChips ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {scope === 'day' && practitioners.length > 1 ? (
                  <Chip
                    label="All"
                    count={totalDayCount}
                    selected={!isLinkedActive && isAllView}
                    onPress={() => {
                      if (isLinkedActive || !isAllView) {
                        hapticSelect();
                        clearOwnerVenue();
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
                    selected={!isLinkedActive && !isAllView && p.id === effectiveId}
                    onPress={() => {
                      if (isLinkedActive || isAllView || p.id !== effectiveId) {
                        hapticSelect();
                        clearOwnerVenue();
                        setSelectedId(p.id);
                      }
                    }}
                  />
                ))}
                {/* Linked venues' calendars — amber-tinted when active. Selecting
                    one sets the linked context (ownerVenueId) and renders that
                    venue's day grid; day-only, so it forces day scope. */}
                {linkedVenues.map((v) => (
                  <Chip
                    key={`linked:${v.venueId}`}
                    label={v.venueName}
                    count={
                      scope === 'day'
                        ? v.bookings.filter((b) => b.bookingDate === anchor).length
                        : undefined
                    }
                    selected={ownerVenueId === v.venueId}
                    selectedColor={colors.warning}
                    onPress={() => {
                      if (ownerVenueId !== v.venueId) {
                        hapticSelect();
                        setOwnerVenueId(v.venueId, v.venueName);
                        if (scope !== 'day') setScope('day');
                      }
                    }}
                  />
                ))}
              </ScrollView>
            ) : null}

            {/* No status-filter pill row here — intentionally omitted on the
                calendar diary (status filtering lives on the Bookings tab). */}
          </View>

          {isLinkedActive ? (
            linkedQuery.isLoading ? (
              <LoadingState message="Loading linked calendar…" />
            ) : !activeLinkedVenue ? (
              <View style={styles.weekBody}>
                <EmptyState
                  title="Linked venue unavailable"
                  message="This linked calendar is no longer shared with you."
                  actionLabel="Back to my calendar"
                  onAction={clearOwnerVenue}
                />
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.linkedContent}>
                <LinkedVenueCalendarGrid
                  venue={activeLinkedVenue}
                  nowMinutes={nowMinutes}
                  refreshing={linkedQuery.isRefetching}
                  onRefresh={() => void linkedQuery.refetch()}
                  onViewBooking={(b) => setLinkedSheet({ kind: 'view', booking: b })}
                  onEditBooking={(b) => setLinkedSheet({ kind: 'edit', booking: b })}
                  onCreate={() => setLinkedSheet({ kind: 'create' })}
                />
              </ScrollView>
            )
          ) : gridQuery.isLoading ? (
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
            // Horizontal swipe pages prev/next week; vertical scroll + day-header
            // taps still work (the pan is horizontal-only — see swipeGesture).
            <GestureDetector gesture={swipeGesture}>
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
            </GestureDetector>
          ) : showAllCalendars ? (
            <View style={styles.weekBody}>
              <AllCalendarsDayGrid
                calendars={allCalendarsForDay}
                venueHours={venueHoursForAnchor}
                nowMinutes={nowMinutes}
                onBlockPress={openDetail}
                onEmptyPress={createAtFor}
                onBlockLongPress={handleBlockLongPress}
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            </View>
          ) : (
            // Horizontal swipe pages prev/next day. The pan is horizontal-only,
            // so vertical scroll and the hold-to-drag on blocks (which arms only
            // after a 500ms hold + fails on sideways drift) are unaffected.
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.weekBody}>
                {dayIsClosed ? <ClosedDayBanner /> : null}
                {dayGrid}
              </View>
            </GestureDetector>
          )}

          {/* Linked calendars have their own per-grid "New booking" button
              (grant-gated); the primary FAB is hidden while a linked venue is active. */}
          {!isLinkedActive ? (
            <Fab
              accessibilityLabel={newBookingActionLabel(terminology)}
              onPress={() => setAddSheetTarget({ kind: 'fab' })}
            />
          ) : null}
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

      {/* After a drag move/resize the guest notification is deferred, so prompt
          the staff member: notify the guest of the new time/length, skip, or undo. */}
      <Sheet visible={moveNotice !== null} onClose={closeMoveNotice}>
        <Text variant="subheading">
          {moveNotice?.durationChanged ? 'Duration updated' : 'Booking moved'}
        </Text>
        <Text variant="caption" tone="muted">
          {moveNotice ? `Let ${moveNotice.guestName} know about the change?` : ''}
        </Text>
        <View style={styles.reassignList}>
          <Button
            label={moveNotice ? `Notify ${moveNotice.guestName}` : 'Notify guest'}
            fullWidth
            onPress={handleNotifyMove}
          />
          <Button label="Don't notify" variant="secondary" fullWidth onPress={closeMoveNotice} />
          <Button label="Undo change" variant="ghost" fullWidth onPress={handleUndoMove} />
        </View>
      </Sheet>

      {/* Date-jump month picker — tap the header date label to open. Reuses the
          month grid (with its own month stepper) so any date is a couple of taps
          away. Selecting a day anchors the day view to it and closes. */}
      <MonthPickerSheet
        visible={monthPickerOpen}
        anchor={anchor}
        today={today}
        counts={counts}
        onSelectDay={jumpToDate}
        onClose={() => setMonthPickerOpen(false)}
      />

      {/* Error feedback routes through the toast host (Alert.alert is a no-op on
          web; the manual Snackbar timer is gone). */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
      />
      <BlockEditSheet
        target={blockTarget}
        onClose={() => setBlockTarget(null)}
      />

      {/* Linked cross-venue booking sheets — view (read-only, grant-gated),
          edit (cancel only with create_edit_cancel), and create. Driven by the
          active linked venue selected in the chip row. */}
      <LinkedBookingDetailSheet
        visible={linkedSheet?.kind === 'view'}
        venueName={activeLinkedVenue?.venueName ?? ''}
        visibility={activeLinkedVenue?.visibility ?? 'time_only'}
        booking={linkedSheet?.kind === 'view' ? linkedSheet.booking : null}
        onClose={() => setLinkedSheet(null)}
      />
      <LinkedBookingEditSheet
        visible={linkedSheet?.kind === 'edit'}
        venueName={activeLinkedVenue?.venueName ?? ''}
        booking={linkedSheet?.kind === 'edit' ? linkedSheet.booking : null}
        canCancel={activeLinkedVenue?.action === 'create_edit_cancel'}
        onClose={() => setLinkedSheet(null)}
        onSaved={() => {
          setLinkedSheet(null);
          void linkedQuery.refetch();
        }}
      />
      <LinkedBookingCreateSheet
        visible={linkedSheet?.kind === 'create'}
        venue={linkedSheet?.kind === 'create' ? activeLinkedVenue : null}
        date={anchor}
        onClose={() => setLinkedSheet(null)}
        onSaved={() => {
          setLinkedSheet(null);
          void linkedQuery.refetch();
        }}
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
  linkedContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scopeControl: {
    flex: 1,
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
