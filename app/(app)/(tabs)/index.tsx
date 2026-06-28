import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { useReduceMotion, motionSafe } from '@/lib/motion';
import { SymbolView } from 'expo-symbols';
import { format, parseISO } from 'date-fns';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { AllCalendarsDayGrid, type AllCalendarColumn } from '@/components/calendar/AllCalendarsDayGrid';
import { BlockEditSheet, type BlockTarget } from '@/components/calendar/BlockEditSheet';
import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { minutesToTime, timeToMinutes, type GridWindowOverride } from '@/components/calendar/grid-layout';
import { resolveDayLoadState } from '@/lib/calendar/day-load-state';
import { nextVisibleCalendars } from '@/lib/calendar/calendar-selection';
import { venueDayHours } from '@/lib/calendar/venue-closures';
import { MonthGrid, type MonthDayDatum } from '@/components/calendar/MonthGrid';
import { MonthPickerSheet } from '@/components/calendar/MonthPickerSheet';
import { type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekGrid, type WeekDayColumn } from '@/components/calendar/WeekGrid';
import { WeekMatrixGrid } from '@/components/calendar/WeekMatrixGrid';
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
import {
  usePersistedCalendarPrefs,
  pruneStaleSelectedId,
  pruneVisibleCalendarIds,
  type CalendarPrefs,
} from '@/lib/queries/usePersistedCalendarPrefs';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useResourcesManageList } from '@/lib/queries/useResourcesManage';
import { useSchedule } from '@/lib/queries/useSchedule';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { LinkedBookingDetailSheet } from '@/components/linked/LinkedBookingDetailSheet';
import { LinkedVenueCalendarGrid } from '@/components/linked/LinkedVenueCalendarGrid';
import { LinkedVenueWeekGrid } from '@/components/linked/LinkedVenueWeekGrid';
import { dedupeScheduleDTOs, toCalendarScheduleBlock } from '@/lib/calendar/schedule-block-view';
import {
  linkedBusyBlock,
  linkedGridBooking,
  linkedHasTemplate,
  linkedOpenRanges,
  linkedScheduleBlocksForDate,
  linkedVenueDayHours,
  rangesToWorkingHours,
} from '@/lib/linked/linked-calendar-view';
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

/**
 * Active linked-venue sheet (view/edit/create a cross-venue booking). Carries
 * its own `venue` so the sheet works for either a single focused linked venue or
 * one of several shown together in the "All" view.
 */
type LinkedSheet =
  | { kind: 'detail'; venue: LinkedVenueCalendar; booking: LinkedBooking }
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

// KIND_ACCENT / capacityLabelFor / toCalendarScheduleBlock / dedupeScheduleDTOs
// live in lib/calendar/schedule-block-view.ts (shared with the linked grid).

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

  // `selectedId` is a calendar id, or the 'all' sentinel for the multi-calendar
  // day view (reception parity). null falls back to the first calendar.
  const ALL_CALENDARS = 'all' as const;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Multi-calendar day view (wide viewports) COLUMN FILTER: which own calendars
  // show side-by-side. null = all (web parity: a proper subset, or "all"). Only
  // applies on a wide DAY viewport — phone single-pane + week scope keep using
  // `selectedId`. Persisted per venue alongside the other prefs.
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);

  // Visible-window override (web parity: From/Until). null edges auto-fit. Held
  // locally and persisted via the F5 prefs hook; threaded into every grid.
  const [windowOverride, setWindowOverride] = useState<GridWindowOverride | null>(null);

  // ---- Persisted per-user calendar prefs (F5, SecureStore) ----
  // Stores { scope, selectedId, startHourOverride, endHourOverride } per venue so
  // the screen restores the user's last view on cold start. Local state above is
  // the live source of truth; we hydrate it ONCE when the persisted value lands,
  // then write back on every user change. A stale selected-calendar id (a
  // practitioner deleted while the app was closed) is pruned against the live
  // calendar ids — same guard `reconcileOwnerVenue` applies to linked venues.
  const calendarPrefs = usePersistedCalendarPrefs(venue?.id ?? null);
  const prefsHydratedRef = useRef(false);

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
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [addSheetTarget, setAddSheetTarget] = useState<AddSheetTarget | null>(null);
  // Month-picker sheet (date jump) — opened by tapping the header date label.
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
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
        // A cross-column move's Undo must also return the booking to its ORIGINAL
        // column — restore the practitioner when one was captured (time-only moves
        // leave it undefined, keeping the current practitioner).
        ...(previous.practitionerId ? { practitionerId: previous.practitionerId } : {}),
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

  // Hydrate the persisted prefs into local state ONCE, after both the prefs read
  // resolves AND the live calendars are known (so the stale-id guard can run).
  // A `?date=` deep-link is an explicit intent that wins over a stored scope, so
  // we skip the stored scope when one was provided. Runs at most once per mount.
  const hasDateDeepLink = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date);
  const { hydrated: prefsHydrated, prefs: storedPrefs, setPrefs: persistPrefs } = calendarPrefs;
  useEffect(() => {
    if (prefsHydratedRef.current) return;
    if (!prefsHydrated) return;
    // Wait for calendars before pruning a stored id (unless there are genuinely
    // none — a venue with zero practitioners — in which case there's nothing to
    // prune against and we still hydrate scope/window).
    if (calendarIds.length === 0 && practitionersQuery.isLoading) return;
    prefsHydratedRef.current = true;

    const pruned = pruneStaleSelectedId(storedPrefs, calendarIds, ALL_CALENDARS);
    const prunedVisible = pruneVisibleCalendarIds(storedPrefs.visibleIds, calendarIds);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration of persisted prefs
    if (!hasDateDeepLink) setScope(pruned.scope);
    setSelectedId(pruned.selectedId);
    setVisibleIds(prunedVisible);
    if (pruned.startHourOverride != null || pruned.endHourOverride != null) {
      setWindowOverride({
        startHour: pruned.startHourOverride,
        endHour: pruned.endHourOverride,
      });
    }
    // If a prune dropped a stale id, persist the corrected value back so the dead
    // id doesn't linger in storage (the persist effect also catches visibleIds).
    if (pruned !== storedPrefs) {
      persistPrefs({ selectedId: pruned.selectedId, visibleIds: prunedVisible });
    }
  }, [
    prefsHydrated,
    storedPrefs,
    persistPrefs,
    calendarIds,
    practitionersQuery.isLoading,
    hasDateDeepLink,
    ALL_CALENDARS,
  ]);

  // Persist scope / selected calendar / window whenever the user changes them.
  // Gated on `prefsHydratedRef` so the initial defaults never overwrite a stored
  // value before hydration runs. `persistPrefs` is a stable callback (useCallback
  // in the hook) and merges a partial, so this is a cheap idempotent write.
  useEffect(() => {
    if (!prefsHydratedRef.current) return;
    persistPrefs({
      scope,
      selectedId,
      visibleIds,
      startHourOverride: windowOverride?.startHour ?? null,
      endHourOverride: windowOverride?.endHour ?? null,
    } satisfies Partial<CalendarPrefs>);
  }, [persistPrefs, scope, selectedId, visibleIds, windowOverride]);

  // ---- Linked venues (cross-venue calendars) ----
  // Any accepted link that shares calendar visibility surfaces as a chip in the
  // switcher row; picking one sets ownerVenueId and renders that venue's day via
  // LinkedVenueCalendarGrid (grant-gated). ownerVenueId persists across launches.
  const { ownerVenueId, setOwnerVenueId, clearOwnerVenue, reconcileOwnerVenue } =
    useLinkedVenueContext();
  // Linked calendars render in day + week scope (month is own-venue only), so
  // fetch the whole week in week scope and just the anchor day otherwise —
  // enough for the day grid and the per-venue day counts on the chips, without a
  // wide month fetch. Mirrors the own grid's range so a linked week has every day.
  const linkedRange = useMemo<DateRange>(
    () => (scope === 'week' ? { from: week.from, to: week.to } : { from: anchor, to: anchor }),
    [scope, anchor, week],
  );
  const linkedQuery = useLinkedCalendar(linkedRange);
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

  // Full resource records (display_on_calendar_id + name) — drives the empty-slot
  // quick menu's "Book <resource>" section, filtered to resources hosted on the
  // tapped column (web parity: `resourcesHere`). Cached + shared with the
  // resource setup flow; only the active ones can be booked.
  const resourcesQuery = useResourcesManageList();
  const activeResources = useMemo(
    () => (resourcesQuery.data ?? []).filter((r) => r.is_active),
    [resourcesQuery.data],
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

  // Wide DAY viewport (tablet / landscape): the side-by-side multi-calendar grid
  // is shown, and its columns can be FILTERED to a subset via a multi-select chip
  // row (web parity). Phone single-pane day + every week scope keep the existing
  // single-select switcher driven by `selectedId`.
  const isWideDay = scope === 'day' && isWideViewport && practitioners.length > 1;

  // On a wide DAY viewport, linked venues are FIRST-CLASS entries in the
  // multi-select: their column id (`linked:<venueId>`) joins the own calendar
  // ids in the visible set, so the filter governs own AND linked columns alike.
  const linkedKeys = useMemo(
    () => linkedVenues.map((v) => `linked:${v.venueId}`),
    [linkedVenues],
  );
  const selectableDayIds = useMemo(
    () => [...calendarIds, ...linkedKeys],
    [calendarIds, linkedKeys],
  );

  // On a wide DAY viewport linked venues are COLUMNS in the side-by-side grid
  // (toggled via the multi-select), NOT a full-screen single-venue context — so
  // the linked-context view is suppressed there. Phone + week scope keep it.
  const linkedContextActive = isLinkedActive && !isWideDay;

  // The calendar being viewed — one at a time, switched via the chips row, OR
  // the 'all' multi-calendar day view. null falls back to the first calendar.
  const isAllView =
    selectedId === ALL_CALENDARS && scope === 'day' && practitioners.length > 1;
  // Week-scope "All" → the whole-team week matrix (practitioner rows × 7 days),
  // rendered by WeekMatrixGrid instead of the single-practitioner WeekGrid.
  const isWeekAllView =
    selectedId === ALL_CALENDARS && scope === 'week' && practitioners.length > 1;
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

  // The single-select switcher (pick one practitioner, or "All"). On a wide DAY
  // viewport the MULTI-SELECT filter (isWideDay) takes over instead, so the
  // single-select form is suppressed there to avoid two competing selectors.
  // Week scope always keeps single-select (it chooses whose week renders).
  const showSwitcher =
    practitioners.length > 1 &&
    scope !== 'month' &&
    !(scope === 'day' && isWideViewport);

  // Show the calendar-switcher row whenever there's something to pick: the
  // primary switcher condition above, OR any linked venue exists / is active
  // (so linked calendars are always reachable, even on a single-practitioner or
  // wide-viewport venue where the primary switcher would otherwise hide).
  const hasLinkedVenues = linkedVenues.length > 0 || isLinkedActive;
  // The wide-day multi-select filter row is its own reason to show the chips —
  // even though the single-select `showSwitcher` is (correctly) false there.
  const showChips = scope !== 'month' && (hasLinkedVenues || showSwitcher || isWideDay);

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

  /**
   * date → rich month-grid datum (per-type counts + linked count + open/closed
   * status) for the displayed month. Appointments come from the grid (No-Show
   * excluded), classes/events/resources from the deduped schedule feed, linked
   * from the linked-calendar feed, and the open/closed status from the venue's
   * weekly hours. Drives the MonthGrid dots / heatmap / Open-Closed label / "+N".
   */
  const monthDayData = useMemo<Record<string, MonthDayDatum>>(() => {
    const map: Record<string, MonthDayDatum> = {};
    const ensure = (date: string): MonthDayDatum => {
      let d = map[date];
      if (!d) {
        const hours = venueDayHours(openingHours, date).kind;
        d = {
          appointments: 0,
          classes: 0,
          events: 0,
          resources: 0,
          linked: 0,
          status: hours === 'closed' ? 'closed' : hours === 'open' ? 'open' : 'unknown',
        };
        map[date] = d;
      }
      return d;
    };

    // Seed EVERY in-month date so empty days still carry their Open/Closed status
    // (the label only shows on empty in-month days). The grid fetches the full
    // month range in month scope, so this covers exactly the displayed month.
    {
      const monthRange = getMonthRangeFromDate(anchor);
      let cursor = monthRange.from;
      // Guard against an unbounded loop on malformed bounds (max 31 days).
      for (let i = 0; i < 31 && cursor <= monthRange.to; i += 1) {
        ensure(cursor);
        cursor = addDaysToDateStr(cursor, 1);
      }
    }

    // Appointments (calendar-grid), No-Show excluded.
    for (const calendar of gridQuery.data?.calendars ?? []) {
      for (const day of calendar.dates) {
        const n = day.bookings.filter((b) => b.status !== 'No-Show').length;
        if (n > 0) ensure(day.date).appointments += n;
      }
    }

    // Classes / events / resources (schedule feed) — dedupe class instances so a
    // busy class counts once (mirrors the grid overlay dedupe).
    for (const dto of dedupeScheduleDTOs(scheduleQuery.data ?? [])) {
      const d = ensure(dto.date);
      if (dto.kind === 'class_session') d.classes += 1;
      else if (dto.kind === 'event_ticket') d.events += 1;
      else if (dto.kind === 'resource_booking') d.resources += 1;
    }

    // Linked-venue bookings per date → the "+N" chip. Counted across all linked
    // venues for the date (month scope is own-venue for the grids, but the count
    // hint is cheap and useful here).
    for (const v of linkedVenues) {
      for (const b of v.bookings) {
        if (b.bookingDate) ensure(b.bookingDate).linked += 1;
      }
    }

    return map;
  }, [gridQuery.data, scheduleQuery.data, linkedVenues, openingHours, anchor]);

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

  // ---- Wide-day multi-calendar column filter (web parity) ----
  // Tapping a calendar from "all" isolates to just it; further taps add/remove
  // it from the visible subset; tapping the sole remaining selection clears back
  // to "all"; selecting every calendar normalizes to "all" (null). Always exits
  // any active linked-venue context, like the single-select switcher does.
  const toggleVisibleCalendar = useCallback(
    (id: string) => {
      hapticSelect();
      clearOwnerVenue();
      setVisibleIds((prev) => nextVisibleCalendars(prev, id, selectableDayIds));
    },
    [selectableDayIds, clearOwnerVenue],
  );

  const selectAllCalendars = useCallback(() => {
    hapticSelect();
    clearOwnerVenue();
    setVisibleIds(null);
  }, [clearOwnerVenue]);

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

  // Practitioner name for the open booking — found via the column it sits in.
  // The detail GET now returns `practitioner_name`, but pass this through as a
  // fallback so the hero's "with {staff}" line stays populated against an older
  // backend (and defensively if the field is ever missing).
  const detailPractitionerName = useMemo(() => {
    if (!detailBookingId) return null;
    for (const cal of gridQuery.data?.calendars ?? []) {
      if (cal.dates.some((d) => d.bookings.some((b) => b.id === detailBookingId))) {
        return practitioners.find((p) => p.id === cal.calendarId)?.name ?? null;
      }
    }
    return null;
  }, [detailBookingId, gridQuery.data, practitioners]);

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
      /** Reassign to a different calendar/practitioner (cross-column drag). */
      practitionerId?: string;
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
          ...(input.practitionerId ? { practitionerId: input.practitionerId } : {}),
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

  // Shared commit for a drag MOVE — vertical (same column) or cross-column (with
  // practitioner reassign). Preserves the duration (pinning the validated end so
  // the server doesn't fall back to the wider catalogue default → false "Blocked
  // time"), captures the prior slot for Undo, and threads the source/target
  // practitioner when reassigning. Web parity: only movable, non-resource bookings.
  const commitTimeMove = useCallback(
    (
      bookingId: string,
      newTime: string,
      reassign?: { toPractitionerId: string; fromPractitionerId: string },
    ) => {
      const booking = findBookingOnAnchor(bookingId);
      if (!booking || !isMovableBooking(booking)) return;
      // A pure time-move to the SAME time is a no-op; a reassign to the same time
      // is still a real move (the practitioner changed).
      if (!reassign && newTime === booking.startTime.slice(0, 5)) return;

      const start = timeToMinutes(booking.startTime);
      const end = booking.endTime ? timeToMinutes(booking.endTime) : null;
      const duration = end != null && end > start ? end - start : null;
      const endTime =
        duration != null
          ? `${minutesToTime(timeToMinutes(`${newTime}:00`) + duration)}:00`
          : undefined;
      commitDrag({
        bookingId,
        time: `${newTime}:00`,
        ...(endTime ? { endTime } : {}),
        ...(reassign ? { practitionerId: reassign.toPractitionerId } : {}),
        previousTarget: {
          id: bookingId,
          guestName: booking.guestName ?? 'booking',
          date: anchor,
          time: booking.startTime,
          durationMinutes: duration,
          // So a cross-column move's Undo returns the booking to its source column.
          ...(reassign ? { practitionerId: reassign.fromPractitionerId } : {}),
        },
        durationChanged: false,
      });
    },
    [findBookingOnAnchor, anchor, commitDrag],
  );

  const handleDragReschedule = useCallback(
    (bookingId: string, newTime: string) => commitTimeMove(bookingId, newTime),
    [commitTimeMove],
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

  // Cross-column drag (multi-calendar grid): drop a booking onto a DIFFERENT own
  // practitioner column → reschedule to the new time AND reassign to that calendar
  // in one PATCH (the server re-validates the target slot and 409s on a clash).
  const handleDragMoveToColumn = useCallback(
    (bookingId: string, newTime: string, targetCalendarId: string, fromCalendarId: string) =>
      commitTimeMove(bookingId, newTime, {
        toPractitionerId: targetCalendarId,
        fromPractitionerId: fromCalendarId,
      }),
    [commitTimeMove],
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
  //
  // The wide-day visible set spans BOTH own calendar ids and linked venue keys
  // (`linked:<venueId>`); null = all. Resolve each axis from it, with a safety
  // fallback to "all" if a (stale) filter would select nothing — so the grid is
  // never blank. Phone single-pane day + week scope ignore the filter entirely.
  const wideFilterActive = isWideDay && visibleIds != null;
  const wideFilterSet = useMemo(() => new Set(visibleIds ?? []), [visibleIds]);

  const dayOwnPractitioners = useMemo(
    () => (wideFilterActive ? practitioners.filter((p) => wideFilterSet.has(p.id)) : practitioners),
    [wideFilterActive, practitioners, wideFilterSet],
  );

  // Linked venues shown as columns: on a wide day filtered by the visible set;
  // on a phone only when "All" (selectedId) is picked (existing behaviour).
  const linkedVenuesForDay = useMemo(() => {
    if (isWideDay) {
      return wideFilterActive
        ? linkedVenues.filter((v) => wideFilterSet.has(`linked:${v.venueId}`))
        : linkedVenues;
    }
    return isAllView ? linkedVenues : [];
  }, [isWideDay, wideFilterActive, wideFilterSet, linkedVenues, isAllView]);

  // If a (stale) filter resolves to zero columns, show everything instead.
  const wideFilterEmpty =
    wideFilterActive && dayOwnPractitioners.length + linkedVenuesForDay.length === 0;
  const ownColumnsSource = wideFilterEmpty ? practitioners : dayOwnPractitioners;
  const linkedColumnsSource = wideFilterEmpty ? linkedVenues : linkedVenuesForDay;

  const allCalendarsForDay = useMemo(() => {
    if (!showAllCalendars) return [];
    return ownColumnsSource.map((p) => {
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
  }, [showAllCalendars, ownColumnsSource, gridQuery.data, anchor, getDayBlocks, scheduleByCalendarDate]);

  // Linked venues as side-by-side columns in the SAME grid — one column per
  // linked venue, appended after the own practitioners. Driven by
  // `linkedColumnsSource`: on a wide day the multi-select subset, on a phone the
  // explicit "All" view, otherwise none.
  // Grant-gated like the linked day grid: time_only → grey "busy" overlays
  // (no appointment bars), full_details → appointment bars + class/event blocks.
  const linkedColumnsForDay = useMemo<AllCalendarColumn[]>(() => {
    return linkedColumnsSource.map((v) => {
      const timeOnly = v.visibility === 'time_only';
      const dayBookings = v.bookings.filter((b) => b.bookingDate === anchor);
      const openRanges = linkedOpenRanges(v, anchor);
      return {
        calendarId: `linked:${v.venueId}`,
        calendarName: v.venueName,
        workingHours: rangesToWorkingHours(openRanges),
        bookings: timeOnly ? [] : dayBookings.map((b) => linkedGridBooking(b, v.practitioners)),
        sessions: [],
        timeBlocks: timeOnly ? dayBookings.map((b) => linkedBusyBlock(b, v.venueName)) : [],
        scheduleBlocks: timeOnly ? [] : linkedScheduleBlocksForDate(v, anchor),
        // This venue's OWN open/closed hours drive its column's closure shading.
        venueHours: linkedVenueDayHours(openRanges, linkedHasTemplate(v)),
        linked: true,
        accent: colors.warning,
      };
    });
  }, [linkedColumnsSource, anchor, colors.warning]);

  // Own practitioner columns + linked venue columns, side by side in one grid.
  const allColumnsForDay = useMemo(
    () => [...allCalendarsForDay, ...linkedColumnsForDay],
    [allCalendarsForDay, linkedColumnsForDay],
  );

  // Tap routing for the combined grid: a column id of `linked:<venueId>` (and
  // any booking id belonging to a linked venue) routes to the linked sheets /
  // cross-venue create flow; everything else is an own-venue practitioner.
  const linkedColumnVenue = useMemo(() => {
    const m = new Map<string, LinkedVenueCalendar>();
    for (const v of linkedVenues) m.set(`linked:${v.venueId}`, v);
    return m;
  }, [linkedVenues]);

  const linkedBookingVenue = useMemo(() => {
    const m = new Map<string, { venue: LinkedVenueCalendar; booking: LinkedBooking }>();
    for (const v of linkedVenues) for (const b of v.bookings) m.set(b.id, { venue: v, booking: b });
    return m;
  }, [linkedVenues]);

  const handleAllBlockPress = useCallback(
    (bookingId: string) => {
      const hit = linkedBookingVenue.get(bookingId);
      if (hit) {
        setLinkedSheet({ kind: 'detail', venue: hit.venue, booking: hit.booking });
        return;
      }
      openDetail(bookingId);
    },
    [linkedBookingVenue, openDetail],
  );

  const handleAllEmptyPress = useCallback(
    (calendarId: string, time: string) => {
      const venue = linkedColumnVenue.get(calendarId);
      if (venue) {
        // Empty-slot create is only offered when the grant allows it; otherwise
        // a tap on a view-only / time-only linked column is a no-op.
        if (venue.action === 'create_edit_cancel') {
          router.push({
            pathname: '/booking/new',
            params: { ownerVenueId: venue.venueId, ownerVenueName: venue.venueName, date: anchor },
          });
        }
        return;
      }
      createAtFor(calendarId, time);
    },
    [linkedColumnVenue, createAtFor, router, anchor],
  );

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

  // ---- Whole-team week matrix data (week-scope "All") ----
  // Practitioner rows + 7 day-column headers. The cell counts are derived inside
  // WeekMatrixGrid straight from gridQuery.data, so this only supplies labels.
  const weekMatrixCalendars = useMemo(
    () => practitioners.map((p) => ({ id: p.id, name: p.name })),
    [practitioners],
  );
  const weekMatrixDays = useMemo(() => {
    if (scope !== 'week') return [];
    return week.days.map((date) => {
      const d = parseISO(`${date}T12:00:00.000Z`);
      const weekday = d.getDay();
      return {
        date,
        weekdayLabel: format(d, 'EEE'),
        dayNumber: format(d, 'd'),
        isToday: date === today,
        isWeekend: weekday === 0 || weekday === 6,
      };
    });
  }, [scope, week.days, today]);

  // Per-booking compliance flags for the anchor day — gated on the feature flag
  // so non-compliance venues never hit the endpoint. Covers EVERY calendar's
  // bookings on the day (not just the selected one) so the multi-calendar grid's
  // columns all get their corner dots, and so the set is stable when switching
  // the single-calendar selection or the wide-day filter (the query key is the
  // sorted id set, so a stable set means no churn).
  const dayBookingIds = useMemo(() => {
    const ids: string[] = [];
    for (const cal of gridQuery.data?.calendars ?? []) {
      const calDay = cal.dates.find((d) => d.date === anchor);
      if (calDay) for (const b of calDay.bookings) ids.push(b.id);
    }
    return ids;
  }, [gridQuery.data, anchor]);
  const complianceFlagsQuery = useComplianceBookingFlags(
    complianceEnabled ? dayBookingIds : [],
  );
  const complianceFlags = complianceFlagsQuery.data?.flags;

  // Day view load/closed state. Stepping the day re-keys the grid query, and
  // `keepPreviousData` holds the prior range (which lacks the new date) until
  // the fetch lands — so `day` is briefly null with isLoading false. Resolve
  // that as "loading" (spinner), never "closed", so the "not scheduled to work
  // this day" banner can't flash during navigation. See day-load-state.ts.
  const { isLoading: dayIsLoading, isClosed: dayIsClosed } = resolveDayLoadState({
    day,
    isFetching: gridQuery.isFetching,
    isPlaceholderData: gridQuery.isPlaceholderData,
  });

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
      windowOverride={windowOverride}
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

  // Resources hosted on the tapped slot's calendar column → "Book <resource>"
  // entries in the empty-slot menu (web parity: `resourcesHere`). Empty when the
  // FAB opened the sheet, or when no resource is displayed on that column.
  const slotResources = useMemo(
    () =>
      addSheetSlot
        ? activeResources.filter((r) => r.display_on_calendar_id === addSheetSlot.practitionerId)
        : [],
    [addSheetSlot, activeResources],
  );

  // Route to the resource booking flow with the resource pre-selected and the
  // tapped day prefilled (web parity: book a resource straight from the slot).
  // The resource flow reads `?resourceId`/`?tab=resource`; the date primes the
  // wizard's anchor day. (Exact slot time isn't a resource-flow param yet — the
  // user picks the length+time on the resource's own availability grid.)
  const bookResourceAtSlot = useCallback(
    (resourceId: string) => {
      closeAddSheet();
      router.push({
        pathname: '/booking/new',
        params: { tab: 'resource', resourceId, date: anchor },
      });
    },
    [closeAddSheet, router, anchor],
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
                    // Linked calendars support day + week; month is own-venue
                    // only, so switching to month exits the linked context back
                    // to the primary venue.
                    if (isLinkedActive && s === 'month') clearOwnerVenue();
                    setScope(s);
                  }}
                  options={SCOPE_OPTIONS}
                />
              </View>
              {/* Realtime indicator — green live / amber reconnecting, hidden when
                  idle (matches Resources/Contacts). Realtime invalidates the grid
                  promptly; the 60s poll is the fallback. */}
              <LiveDot state={liveState} />
              {/* Quick jump to the "Today" home (KPI / day-at-a-glance), distinct
                  from the in-grid Today pill that re-anchors the diary to today. */}
              <IconButton
                icon={{ ios: 'sun.max', android: 'wb_sunny', web: 'wb_sunny' }}
                accessibilityLabel="Open Today overview"
                variant="bordered"
                onPress={() => router.push('/today')}
              />
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

            {/* Calendar switcher. Phone single-pane day + week scope: single-
                select (one calendar, or "All" → side-by-side day / week matrix).
                Wide day viewport: a MULTI-SELECT filter over the side-by-side
                columns (show one, a subset, or all). Linked-venue chips follow. */}
            {showChips ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {isWideDay ? (
                  // Wide DAY view: ONE multi-select column filter (web parity)
                  // spanning OWN calendars AND linked venues — "All" plus a toggle
                  // each. Any non-empty subset renders side-by-side; only the
                  // selected columns show. Highlighted = visible (everything is
                  // highlighted when no filter is active).
                  <>
                    <Chip
                      label="All"
                      count={totalDayCount}
                      selected={visibleIds == null}
                      onPress={selectAllCalendars}
                    />
                    {practitioners.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.name}
                        count={perPractitionerCounts[p.id]}
                        selected={visibleIds == null || visibleIds.includes(p.id)}
                        onPress={() => toggleVisibleCalendar(p.id)}
                      />
                    ))}
                    {linkedVenues.map((v) => {
                      const key = `linked:${v.venueId}`;
                      return (
                        <Chip
                          key={key}
                          label={v.venueName}
                          count={v.bookings.filter((b) => b.bookingDate === anchor).length}
                          selected={visibleIds == null || visibleIds.includes(key)}
                          selectedColor={colors.warning}
                          onPress={() => toggleVisibleCalendar(key)}
                        />
                      );
                    })}
                  </>
                ) : (
                  <>
                    {(scope === 'day' || scope === 'week') && practitioners.length > 1 ? (
                      <Chip
                        label="All"
                        count={scope === 'day' ? totalDayCount : undefined}
                        selected={!isLinkedActive && (isAllView || isWeekAllView)}
                        onPress={() => {
                          if (isLinkedActive || selectedId !== ALL_CALENDARS) {
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
                        selected={
                          !isLinkedActive && !isAllView && !isWeekAllView && p.id === effectiveId
                        }
                        onPress={() => {
                          if (isLinkedActive || isAllView || isWeekAllView || p.id !== effectiveId) {
                            hapticSelect();
                            clearOwnerVenue();
                            setSelectedId(p.id);
                          }
                        }}
                      />
                    ))}
                    {/* Linked venues' calendars — selecting one sets the linked
                        context (ownerVenueId) and renders that venue's day/week
                        grid full-screen. (On a wide day they instead appear as
                        toggleable columns in the multi-select above.) */}
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
                          }
                        }}
                      />
                    ))}
                  </>
                )}
              </ScrollView>
            ) : null}

            {/* No status-filter pill row here — intentionally omitted on the
                calendar diary (status filtering lives on the Bookings tab). */}
          </View>

          {linkedContextActive ? (
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
            ) : scope === 'week' ? (
              // Linked week view — the week-scope sibling of the day grid below,
              // rendering the same shared WeekGrid so a linked venue's week looks
              // and pages exactly like the primary venue's. Horizontal swipe
              // steps weeks (swipeGesture); tapping a day header opens that day.
              <GestureDetector gesture={swipeGesture}>
                <View style={styles.weekBody}>
                  <LinkedVenueWeekGrid
                    venue={activeLinkedVenue}
                    weekDays={week.days}
                    today={today}
                    nowMinutes={nowMinutes}
                    refreshing={linkedQuery.isRefetching}
                    onRefresh={() => void linkedQuery.refetch()}
                    onOpenBooking={(b) =>
                      setLinkedSheet({ kind: 'detail', venue: activeLinkedVenue, booking: b })
                    }
                    onCreate={(date) =>
                      // Empty-slot tap carries the tapped day; the header button
                      // passes none → use the current anchor. The full booking
                      // form opens scoped to this linked venue.
                      router.push({
                        pathname: '/booking/new',
                        params: {
                          ownerVenueId: activeLinkedVenue.venueId,
                          ownerVenueName: activeLinkedVenue.venueName,
                          date: date ?? anchor,
                        },
                      })
                    }
                    onDayPress={(date) => {
                      hapticSelect();
                      setAnchor(date);
                      setScope('day');
                    }}
                  />
                </View>
              </GestureDetector>
            ) : (
              <ScrollView
                contentContainerStyle={styles.linkedContent}
                refreshControl={
                  <RefreshControl
                    refreshing={linkedQuery.isRefetching}
                    onRefresh={() => void linkedQuery.refetch()}
                    tintColor={colors.brand}
                  />
                }>
                <LinkedVenueCalendarGrid
                  embedded
                  venue={activeLinkedVenue}
                  date={anchor}
                  nowMinutes={nowMinutes}
                  onOpenBooking={(b) =>
                    setLinkedSheet({ kind: 'detail', venue: activeLinkedVenue, booking: b })
                  }
                  onCreate={() =>
                    router.push({
                      pathname: '/booking/new',
                      params: {
                        ownerVenueId: activeLinkedVenue.venueId,
                        ownerVenueName: activeLinkedVenue.venueName,
                        date: anchor,
                      },
                    })
                  }
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
                dayData={monthDayData}
                onSelectDay={(date) => {
                  setAnchor(date);
                  setScope('day');
                }}
              />
            </ScrollView>
          ) : scope === 'week' && isWeekAllView ? (
            // Whole-team week matrix: practitioner rows × 7 day columns, read-only.
            // Horizontal swipe still pages weeks; tapping a day header or a cell
            // drills into that day's full Day view.
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.weekBody}>
                <WeekMatrixGrid
                  calendars={weekMatrixCalendars}
                  days={weekMatrixDays}
                  grid={gridQuery.data}
                  onDayPress={(date) => {
                    hapticSelect();
                    setAnchor(date);
                    setScope('day');
                  }}
                  onCellPress={(calendarId, date) => {
                    hapticSelect();
                    setAnchor(date);
                    setSelectedId(calendarId);
                    setScope('day');
                  }}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              </View>
            </GestureDetector>
          ) : scope === 'week' ? (
            // Horizontal swipe pages prev/next week; vertical scroll + day-header
            // taps still work (the pan is horizontal-only — see swipeGesture).
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.weekBody}>
                <WeekGrid
                  days={weekColumns}
                  windowOverride={windowOverride}
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
            // Every calendar side by side in ONE horizontally-scrolling grid:
            // the venue's own practitioner columns, plus (only when "All" is
            // explicitly picked) one column per linked venue. A single grid =
            // a single vertical scroll, with the columns scrolling left/right
            // together — no stacked grids, no nested scroll. Linked taps route
            // to the linked detail sheet / cross-venue create flow.
            <View style={styles.weekBody}>
              <AllCalendarsDayGrid
                calendars={allColumnsForDay}
                venueHours={venueHoursForAnchor}
                windowOverride={windowOverride}
                nowMinutes={nowMinutes}
                onBlockPress={handleAllBlockPress}
                onEmptyPress={handleAllEmptyPress}
                onStatusChange={handleStatusChange}
                onArrivalToggle={handleArrivalToggle}
                complianceFlags={complianceFlags}
                onDragReschedule={handleDragReschedule}
                onDragResize={handleDragResize}
                onDragConflictReject={handleDragConflictReject}
                onDragMoveToColumn={handleDragMoveToColumn}
                pendingActionIds={pendingActionIds}
                refreshing={refreshing || linkedQuery.isRefetching}
                onRefresh={() => {
                  onRefresh();
                  void linkedQuery.refetch();
                }}
              />
            </View>
          ) : (
            // Horizontal swipe pages prev/next day. The pan is horizontal-only,
            // so vertical scroll and the hold-to-drag on blocks (which arms only
            // after a 500ms hold + fails on sideways drift) are unaffected.
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.weekBody}>
                {dayIsLoading ? (
                  // The next day's data is still loading (keepPreviousData holds
                  // the prior range). Show a spinner rather than an empty grid or
                  // a premature "closed" banner — the column fills in once the
                  // fetch lands.
                  <LoadingState message="Loading appointments…" />
                ) : (
                  <>
                    {dayIsClosed ? <ClosedDayBanner /> : null}
                    {dayGrid}
                  </>
                )}
              </View>
            </GestureDetector>
          )}

          {/* Linked calendars have their own per-grid "New booking" button
              (grant-gated); the primary FAB is hidden only in the full-screen
              linked context (not on a wide day, where linked are just columns). */}
          {!linkedContextActive ? (
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
          {/* Walk-in — slot-aware: starts at the TAPPED slot time when a slot
              opened the sheet, else "now" (FAB). Web parity: the slot menu offers
              a Walk-in at that exact time, not the current time. */}
          <Button
            label="Walk-in"
            variant="secondary"
            fullWidth
            onPress={() => {
              const slot = addSheetSlot;
              closeAddSheet();
              router.push({
                pathname: '/booking/new',
                params: slot
                  ? {
                      date: anchor,
                      practitionerId: slot.practitionerId,
                      time: slot.time,
                      intent: 'walk-in',
                    }
                  : { date: anchor, time: nowTime, intent: 'walk-in' },
              });
            }}
          />
          {/* Block time — slot only (the FAB has no target column/time). */}
          {addSheetSlot ? (
            <Button
              label="Block time"
              variant="secondary"
              fullWidth
              onPress={() => {
                const slot = addSheetSlot;
                closeAddSheet();
                setBlockTarget({
                  mode: 'create',
                  practitionerId: slot.practitionerId,
                  date: anchor,
                  startTime: slot.time,
                });
              }}
            />
          ) : null}

          {/* "Book <resource>" — one button per resource hosted on the tapped
              column (web parity: `resourcesHere`). Routes to the resource flow
              with the resource pre-selected and the day prefilled. */}
          {slotResources.length > 0 ? (
            <>
              <Text variant="caption" tone="muted" style={styles.addSheetSectionLabel}>
                Book a resource
              </Text>
              {slotResources.map((r) => (
                <Button
                  key={r.id}
                  label={`Book ${r.name}`}
                  variant="secondary"
                  fullWidth
                  onPress={() => bookResourceAtSlot(r.id)}
                />
              ))}
            </>
          ) : null}

          <Button label="Cancel" variant="ghost" fullWidth onPress={closeAddSheet} />
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
        <View style={styles.moveNoticeActions}>
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
        // Visible-window (From/Until) control lives in this sheet (web parity:
        // the toolbar date panel embeds the time-range picker). Persisted per
        // venue via the F5 hook by the scope/selectedId/window effect above.
        windowOverride={windowOverride}
        onWindowChange={setWindowOverride}
        onClose={() => setMonthPickerOpen(false)}
      />

      {/* Error feedback routes through the toast host (Alert.alert is a no-op on
          web; the manual Snackbar timer is gone). */}
      <BookingDetailSheet
        bookingId={detailBookingId}
        onClose={() => setDetailBookingId(null)}
        fallbackPractitionerName={detailPractitionerName}
      />
      <BlockEditSheet
        target={blockTarget}
        onClose={() => setBlockTarget(null)}
      />

      {/* Linked cross-venue booking detail — one rich expanded detail (read-only
          or editable per the grant). It carries its own venue, so it works for a
          single focused linked venue or any of several shown together in the
          "All" view. Creating a booking opens the full form (scoped to the
          linked venue) rather than a sheet. */}
      <LinkedBookingDetailSheet
        visible={linkedSheet?.kind === 'detail'}
        venue={linkedSheet?.kind === 'detail' ? linkedSheet.venue : null}
        booking={linkedSheet?.kind === 'detail' ? linkedSheet.booking : null}
        onClose={() => setLinkedSheet(null)}
        onSaved={() => void linkedQuery.refetch()}
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
    gap: spacing.lg,
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
  addSheetSectionLabel: {
    marginTop: spacing.xs,
  },
  moveNoticeActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
