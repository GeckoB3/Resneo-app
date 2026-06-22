/**
 * AllCalendarsDayGrid
 *
 * Reception-parity multi-calendar day view: one column per practitioner for a
 * single date, sharing a sticky left time-gutter and a single now-line. The
 * columns scroll horizontally; the gutter and grid lines stay put.
 *
 * Own-venue blocks support hold-drag MOVE (vertical) + RESIZE (bottom edge), and
 * a move may travel horizontally onto ANOTHER own column to reassign the booking
 * there (cross-column). All reuse DraggableAppointmentBlock — the same proven
 * gesture config (hold-to-arm + failOffsetX) the single-calendar grid uses, so a
 * plain vertical swipe still scrolls the grid and a horizontal swipe still pages
 * the columns. Linked-venue columns stay READ-ONLY (no drag — and aren't valid
 * cross-column drop targets, since you can't move a booking across venues).
 * Tapping a block opens its detail; tapping an empty slot starts a new booking.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';
import {
  CONFLICT_IGNORED_STATUSES,
  MOVABLE_STATUSES,
  type BusyRange,
  type CalendarTimeBlock,
} from '@/components/calendar/CalendarDayGrid';
import { DraggableAppointmentBlock } from '@/components/calendar/DraggableAppointmentBlock';
import {
  computeGridBounds,
  computeLaneLayouts,
  hourLabel,
  MIN_BLOCK_HEIGHT,
  minutesToTime,
  PX_PER_MINUTE,
  TAP_SNAP_MINUTES,
  TIME_GUTTER_WIDTH,
  timeToMinutes,
  type GridWindowOverride,
  type LaneInput,
} from '@/components/calendar/grid-layout';
import { Text } from '@/components/ui/Text';
import { venueClosedRanges, type VenueDayHours } from '@/lib/calendar/venue-closures';
import { hexToRgba } from '@/lib/color';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CalendarGridBooking,
  CalendarGridSession,
  CalendarGridWorkingHours,
} from '@/types/calendar-grid';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

const DEFAULT_DURATION_MINUTES = 30;
const COLUMN_WIDTH = 168;
const COLUMN_GAP = spacing.xs;
/** Horizontal distance between adjacent columns (width + gap) — converts a
 *  cross-column drag's translationX into a target-column delta. */
const COLUMN_PITCH = COLUMN_WIDTH + COLUMN_GAP;
/** Distance (px) from a horizontal edge that arms auto-scroll during a cross-column drag. */
const SCROLL_EDGE = 56;
/** Pixels scrolled per frame while the dragging finger sits in the edge zone. */
const SCROLL_SPEED = 9;
const PADDING_TOP = spacing.sm;
const SESSION_ACCENT = '#6366F1';

/** One calendar's day data (a practitioner, or a linked venue), as assembled by the calendar screen. */
export type AllCalendarColumn = {
  calendarId: string;
  calendarName: string;
  workingHours: CalendarGridWorkingHours[];
  bookings: CalendarGridBooking[];
  sessions: CalendarGridSession[];
  timeBlocks: CalendarTimeBlock[];
  /** Class/event/resource blocks (schedule feed) for this column's date. */
  scheduleBlocks: CalendarScheduleBlock[];
  /**
   * This column's own open/closed hours for the date. A linked venue's hours
   * differ from the host venue's, so closed-shading is resolved per column;
   * falls back to the grid-level `venueHours` prop when omitted (own columns).
   */
  venueHours?: VenueDayHours;
  /**
   * A linked venue's column (cross-venue). Tinted with `accent`, and the
   * "hold to move to another practitioner" long-press is disabled (you can't
   * reassign across venues).
   */
  linked?: boolean;
  /** Header / column accent colour (e.g. amber for a linked venue). */
  accent?: string;
};

type PositionedBooking = {
  booking: CalendarGridBooking;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
  /** True duration (end − start) in minutes — feeds the resize gesture. */
  durationMinutes: number;
  timeLabel: string;
};

type AllCalendarsDayGridProps = {
  calendars: AllCalendarColumn[];
  /** Venue open/closed state for the date (same across columns) → "Closed" shading. */
  venueHours?: VenueDayHours;
  /**
   * User's visible-window override (web parity: From/Until). Widens the shared
   * time scale across all columns without clipping any booking outside it.
   */
  windowOverride?: GridWindowOverride | null;
  /** Current time in minutes-since-midnight, or null when not viewing today. */
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  /** Empty-slot tap → carries the column's practitioner id + the snapped time. */
  onEmptyPress: (practitionerId: string, time: string) => void;
  /** Hold-drag MOVE release on an OWN column → new "HH:mm" (keeps the practitioner). */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /** Hold-RESIZE release on an OWN column → the new duration in minutes. */
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
  /** A drag/resize was refused (overlap) → surface a "slot taken" message. */
  onDragConflictReject?: () => void;
  /** Drag-onto-another-own-column release → reassign (new time + target calendar). */
  onDragMoveToColumn?: (
    bookingId: string,
    newTime: string,
    targetCalendarId: string,
    fromCalendarId: string,
  ) => void;
  /** Bookings with an in-flight move/resize — drives each block's pending + snap-home. */
  pendingActionIds?: Set<string>;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Lay out one column's bookings into lanes on TRUE minute ranges. */
function positionColumn(
  bookings: CalendarGridBooking[],
  gridStartMin: number,
): PositionedBooking[] {
  const raw = bookings.map((booking) => {
    const start = timeToMinutes(booking.startTime);
    let end = booking.endTime ? timeToMinutes(booking.endTime) : start + DEFAULT_DURATION_MINUTES;
    if (end <= start) end = start + DEFAULT_DURATION_MINUTES;
    return { booking, start, end };
  });

  const laneInputs: LaneInput[] = raw.map(({ booking, start, end }) => ({
    id: booking.id,
    top: (start - gridStartMin) * PX_PER_MINUTE,
    bottom: (end - gridStartMin) * PX_PER_MINUTE,
  }));
  const lanes = computeLaneLayouts(laneInputs);

  return raw.map(({ booking, start, end }) => {
    const lane = lanes.get(booking.id) ?? { laneIndex: 0, laneCount: 1 };
    return {
      booking,
      top: (start - gridStartMin) * PX_PER_MINUTE,
      height: Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT),
      laneIndex: lane.laneIndex,
      laneCount: lane.laneCount,
      durationMinutes: end - start,
      timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
    };
  });
}

/**
 * Multi-calendar day view. Shares one time scale across every column so the
 * gutter, hour lines and now-line line up across all practitioners.
 */
export function AllCalendarsDayGrid({
  calendars,
  venueHours,
  windowOverride,
  nowMinutes,
  onBlockPress,
  onEmptyPress,
  onDragReschedule,
  onDragResize,
  onDragConflictReject,
  onDragMoveToColumn,
  pendingActionIds,
  refreshing = false,
  onRefresh,
}: AllCalendarsDayGridProps) {
  const { colors } = useTheme();

  // Cross-column drag: own (non-linked) columns come FIRST in `calendars`, so a
  // column's array index doubles as its own-column index. `liftedColumn` holds
  // the index of the column currently being dragged (or -1); each column reads it
  // to raise its z-order so the dragged block can float over its neighbours.
  const liftedColumn = useSharedValue(-1);
  const ownColumnCount = useMemo(() => calendars.filter((c) => !c.linked).length, [calendars]);
  const ownColumnIds = useMemo(
    () => calendars.filter((c) => !c.linked).map((c) => c.calendarId),
    [calendars],
  );

  // ── Edge auto-scroll during a cross-column drag ───────────────────────────
  // The columns ScrollView is frozen while a drag is armed (the pan owns the
  // gesture), so a frame loop nudges it once the dragging finger reaches an edge,
  // letting off-screen own columns become drop targets. `autoScrollDelta` (how far
  // we've scrolled since arm) is fed back to the block so its visual offset + its
  // target-column math stay aligned with the finger as the columns slide past.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useSharedValue(0);
  const viewportW = useSharedValue(0);
  const contentW = useSharedValue(0);
  const dragAbsX = useSharedValue(-1);
  const autoScrollDelta = useSharedValue(0);
  const dragStartScroll = useSharedValue(0);
  const scrollTarget = useSharedValue(0);

  useEffect(() => {
    contentW.value = calendars.length * COLUMN_PITCH;
  }, [calendars.length, contentW]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollOffset.value = e.contentOffset.x;
  });

  const autoScroll = useFrameCallback(() => {
    'worklet';
    // Arm/disarm + baseline are handled in the reaction below; this guards the
    // brief deactivation lag and the pre-layout (viewportW === 0) window.
    if (dragAbsX.value < 0 || viewportW.value <= 0) return;
    // Left of the columns is the sticky time gutter; right edge is one viewport on.
    const left = TIME_GUTTER_WIDTH;
    const right = left + viewportW.value;
    let step = 0;
    if (dragAbsX.value < left + SCROLL_EDGE) step = -SCROLL_SPEED;
    else if (dragAbsX.value > right - SCROLL_EDGE) step = SCROLL_SPEED;
    if (step !== 0) {
      const maxScroll = Math.max(0, contentW.value - viewportW.value);
      const next = Math.min(maxScroll, Math.max(0, scrollTarget.value + step));
      if (next !== scrollTarget.value) {
        scrollTarget.value = next;
        scrollTo(scrollRef, next, 0, false);
      }
    }
    autoScrollDelta.value = scrollTarget.value - dragStartScroll.value;
  }, false);

  // Run the auto-scroll frame loop ONLY while a cross-column drag is active — an
  // always-on frame callback would keep the UI thread awake every frame.
  const setAutoScrollActive = useCallback(
    (a: boolean) => autoScroll.setActive(a),
    [autoScroll],
  );
  // The React Compiler immutability rule false-positives on Reanimated shared-value
  // writes inside this reaction — it runs on the UI thread as a worklet, where
  // mutating `.value` is the intended pattern (the useFrameCallback above does the
  // same, but that hook is special-cased by the rule and this one isn't). Same known
  // suppression as the viewportW onLayout write further down.
  /* eslint-disable react-hooks/immutability */
  useAnimatedReaction(
    () => dragAbsX.value >= 0,
    (active, was) => {
      if (active === was) return;
      if (active) {
        // Arm deterministically on the UI thread: anchor the scroll baseline so
        // the delta starts at 0 (don't rely on a frame ticking at the right moment).
        dragStartScroll.value = scrollOffset.value;
        scrollTarget.value = scrollOffset.value;
      } else {
        // Disarm: zero the delta so the NEXT drag can't inherit a stale offset.
        autoScrollDelta.value = 0;
      }
      runOnJS(setAutoScrollActive)(active);
    },
  );
  /* eslint-enable react-hooks/immutability */

  // Shared bounds across ALL columns so every column uses the same time scale.
  const { startHour, endHour, totalHeight, gridStartMin } = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    for (const cal of calendars) {
      for (const wh of cal.workingHours) {
        ranges.push({ start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) });
      }
      for (const b of cal.bookings) {
        const start = timeToMinutes(b.startTime);
        const end = b.endTime ? timeToMinutes(b.endTime) : start + DEFAULT_DURATION_MINUTES;
        ranges.push({ start, end: Math.max(end, start + DEFAULT_DURATION_MINUTES) });
      }
      for (const tb of cal.timeBlocks) {
        ranges.push({ start: timeToMinutes(tb.start), end: timeToMinutes(tb.end) });
      }
      for (const s of cal.sessions) {
        ranges.push({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) });
      }
      for (const sb of cal.scheduleBlocks) {
        ranges.push({ start: timeToMinutes(sb.startTime), end: timeToMinutes(sb.endTime) });
      }
    }
    const bounds = computeGridBounds(ranges, windowOverride);
    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: (bounds.endHour - bounds.startHour) * 60 * PX_PER_MINUTE,
      gridStartMin: bounds.startHour * 60,
    };
  }, [calendars, windowOverride]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

  // The multi-column body: a sticky time gutter beside the horizontally
  // scrolling practitioner columns, sharing one time scale (full day height).
  const body = (
      <View style={styles.row}>
        {/* Sticky time gutter — hour labels shared by every column. */}
        <View style={[styles.gutter, { height: totalHeight + PADDING_TOP }]}>
          {hours.map((hour) => (
            <Text
              key={hour}
              variant="caption"
              tone="muted"
              style={[styles.gutterLabel, { top: (hour - startHour) * 60 * PX_PER_MINUTE - 7 }]}>
              {hourLabel(hour)}
            </Text>
          ))}
        </View>

        {/* Columns scroll horizontally; the gutter stays put. */}
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onLayout={(e) => {
            // eslint-disable-next-line react-hooks/immutability -- shared-value write from a layout handler (supported Reanimated pattern)
            viewportW.value = e.nativeEvent.layout.width;
          }}>
          <View>
            {/* Column headers (practitioner names) */}
            <View style={styles.headerRow}>
              {calendars.map((cal) => {
                // Linked venues read amber (matching the linked chip); own
                // practitioner columns stay neutral.
                const tint = cal.linked ? cal.accent ?? colors.warning : null;
                return (
                  <View
                    key={cal.calendarId}
                    style={[
                      styles.headerCell,
                      { borderColor: tint ?? colors.border },
                      tint ? { backgroundColor: hexToRgba(tint, 0.1) } : null,
                    ]}>
                    <Text
                      variant="label"
                      numberOfLines={1}
                      style={tint ? { color: tint } : undefined}>
                      {cal.calendarName}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={{ height: totalHeight }}>
              {/* Shared hour lines across the full column band. */}
              {hours.map((hour) => (
                <View
                  key={hour}
                  pointerEvents="none"
                  style={[
                    styles.hourLine,
                    { top: (hour - startHour) * 60 * PX_PER_MINUTE, backgroundColor: colors.border },
                  ]}
                />
              ))}

              {/* Now-line spanning all columns. */}
              {nowTop != null ? (
                <View
                  pointerEvents="none"
                  style={[styles.nowLine, { top: nowTop, backgroundColor: colors.danger }]}
                />
              ) : null}

              {/* Explicit height so each column (and its absolute-fill empty-tap
                  Pressable) spans the full grid: the column's children are all
                  absolutely positioned, so without this the column collapses to
                  0px and empty-slot taps never register (only the explicitly-
                  sized appointment blocks would be tappable). Columns stretch to
                  this height via the row's default alignItems: 'stretch'. */}
              <View style={[styles.columnsRow, { height: totalHeight }]}>
                {calendars.map((cal, index) => (
                  <DayColumn
                    key={cal.calendarId}
                    column={cal}
                    columnIndex={index}
                    ownColumnCount={ownColumnCount}
                    ownColumnIds={ownColumnIds}
                    liftedColumn={liftedColumn}
                    dragAbsX={dragAbsX}
                    autoScrollDelta={autoScrollDelta}
                    gridStartMin={gridStartMin}
                    startHour={startHour}
                    endHour={endHour}
                    // Closed-shading is per column: a linked venue's hours differ
                    // from the host's, so each column shades its OWN closed time
                    // (own columns fall back to the grid-level venueHours).
                    closedRanges={venueClosedRanges(
                      cal.venueHours ?? venueHours,
                      startHour * 60,
                      endHour * 60,
                    )}
                    onBlockPress={onBlockPress}
                    onEmptyPress={onEmptyPress}
                    onDragReschedule={onDragReschedule}
                    onDragResize={onDragResize}
                    onDragConflictReject={onDragConflictReject}
                    onDragMoveToColumn={onDragMoveToColumn}
                    pendingActionIds={pendingActionIds}
                  />
                ))}
              </View>
            </View>
          </View>
        </Animated.ScrollView>
      </View>
  );

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        ) : undefined
      }>
      {body}
    </ScrollView>
  );
}

/** One practitioner's vertical strip of bookings + overlays. */
function DayColumn({
  column,
  columnIndex,
  ownColumnCount,
  ownColumnIds,
  liftedColumn,
  dragAbsX,
  autoScrollDelta,
  gridStartMin,
  startHour,
  endHour,
  closedRanges,
  onBlockPress,
  onEmptyPress,
  onDragReschedule,
  onDragResize,
  onDragConflictReject,
  onDragMoveToColumn,
  pendingActionIds,
}: {
  column: AllCalendarColumn;
  /** This column's index in the grid (own columns are first). */
  columnIndex: number;
  /** Number of own (non-linked) columns — the valid cross-column target range. */
  ownColumnCount: number;
  /** Own columns' calendar ids, indexed — target index → calendar id at drop. */
  ownColumnIds: string[];
  /** Shared "which column is dragging" value (this column lifts when it matches). */
  liftedColumn: SharedValue<number>;
  dragAbsX: SharedValue<number>;
  autoScrollDelta: SharedValue<number>;
  gridStartMin: number;
  startHour: number;
  endHour: number;
  /** This column's out-of-hours / closed-day minute ranges (already resolved). */
  closedRanges: { start: number; end: number }[];
  onBlockPress: (bookingId: string) => void;
  onEmptyPress: (practitionerId: string, time: string) => void;
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
  onDragConflictReject?: () => void;
  onDragMoveToColumn?: (
    bookingId: string,
    newTime: string,
    targetCalendarId: string,
    fromCalendarId: string,
  ) => void;
  pendingActionIds?: Set<string>;
}) {
  const { colors } = useTheme();
  const positioned = useMemo(
    () => positionColumn(column.bookings, gridStartMin),
    [column.bookings, gridStartMin],
  );

  const overlays = useMemo(
    () =>
      column.timeBlocks
        .map((block) => {
          const start = timeToMinutes(block.start);
          const end = timeToMinutes(block.end);
          return { block, start, end };
        })
        .filter(({ start, end }) => end > start),
    [column.timeBlocks],
  );

  const sessions = useMemo(
    () =>
      column.sessions
        .map((session) => {
          const start = timeToMinutes(session.startTime);
          const end = timeToMinutes(session.endTime);
          return { session, start, end };
        })
        .filter(({ start, end }) => end > start),
    [column.sessions],
  );

  const scheduleBlocks = useMemo(
    () =>
      column.scheduleBlocks
        .map((block) => {
          const start = timeToMinutes(block.startTime);
          const end = timeToMinutes(block.endTime);
          return { block, start, end };
        })
        .filter(({ start, end }) => end > start),
    [column.scheduleBlocks],
  );

  // Conflict inputs for the hold-drag/resize gesture on OWN columns: every
  // wall-holding range in THIS column (bookings minus Cancelled/No-Show, manual
  // blocks, capacity sessions, schedule blocks), plus the column's open hours (a
  // drop outside them is allowed but flagged amber). Linked columns never drag.
  const busyRanges = useMemo<(BusyRange & { id: string })[]>(() => {
    const out: (BusyRange & { id: string })[] = [];
    for (const b of column.bookings) {
      if (CONFLICT_IGNORED_STATUSES.has(b.status)) continue;
      const start = timeToMinutes(b.startTime);
      let end = b.endTime ? timeToMinutes(b.endTime) : start + DEFAULT_DURATION_MINUTES;
      if (end <= start) end = start + DEFAULT_DURATION_MINUTES;
      out.push({ id: b.id, start, end });
    }
    for (const { block, start, end } of overlays) out.push({ id: block.id, start, end });
    for (const { session, start, end } of sessions) out.push({ id: session.id, start, end });
    for (const { block, start, end } of scheduleBlocks) out.push({ id: block.id, start, end });
    return out;
  }, [column.bookings, overlays, sessions, scheduleBlocks]);

  const workingRanges = useMemo<BusyRange[]>(
    () =>
      column.workingHours.map((wh) => ({
        start: timeToMinutes(wh.start),
        end: timeToMinutes(wh.end),
      })),
    [column.workingHours],
  );

  // Linked columns read amber (matching the linked chip) with a faint wash.
  const accent = column.linked ? column.accent ?? colors.warning : null;

  // Raise this column's DRAW ORDER (zIndex only — NOT elevation) while ITS block
  // is being dragged, so the dragged block can travel over the neighbouring
  // columns (RN paints later siblings on top otherwise). We deliberately avoid
  // `elevation`: it would cast a Material shadow over the whole column on Android,
  // changing the column's appearance mid-drag. The dragged block keeps its own
  // lift/shadow (as in the single-calendar grid); the column itself must not move.
  const liftStyle = useAnimatedStyle(() => ({
    zIndex: liftedColumn.value === columnIndex ? 50 : 0,
  }));

  return (
    <Animated.View
      style={[
        styles.column,
        { borderColor: accent ?? colors.border },
        accent ? { backgroundColor: hexToRgba(accent, 0.05) } : null,
        liftStyle,
      ]}>
      {/* Per-column venue-closed shading (out-of-hours / closed day). Each column
          shades its OWN hours so a linked venue's closures stay accurate even
          when they differ from the host venue's. */}
      {closedRanges.map((r) => {
        const top = (r.start - startHour * 60) * PX_PER_MINUTE;
        const height = (r.end - r.start) * PX_PER_MINUTE;
        return (
          <View
            key={`closed-${r.start}-${r.end}`}
            pointerEvents="none"
            style={[styles.closedBand, { top, height, backgroundColor: hexToRgba(colors.text, 0.06) }]}>
            {height >= 26 ? (
              <Text variant="caption" tone="muted" style={styles.closedLabel}>
                Closed
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Empty-slot tap layer (blocks/overlays render above). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel={`Tap an empty slot to add a booking for ${column.calendarName}`}
        onPress={(event) => {
          const y = event.nativeEvent.locationY;
          const minutes = startHour * 60 + y / PX_PER_MINUTE;
          const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
          // Clamp to the visible window (a tap below the last hour line must not
          // map past endHour, which minutesToTime would cap at 23:59).
          const clamped = Math.min(Math.max(snapped, startHour * 60), endHour * 60);
          onEmptyPress(column.calendarId, minutesToTime(clamped));
        }}
      />

      {/* Blocked-time overlays */}
      {overlays.map(({ block, start, end }) => (
        <View
          key={block.id}
          pointerEvents="none"
          style={[
            styles.overlay,
            {
              top: (start - gridStartMin) * PX_PER_MINUTE,
              height: Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT),
              borderColor: colors.border,
            },
          ]}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {block.label?.trim() || 'Blocked'}
          </Text>
        </View>
      ))}

      {/* Class/event capacity blocks (indigo) */}
      {sessions.map(({ session, start, end }) => (
        <View
          key={session.id}
          pointerEvents="none"
          style={[
            styles.session,
            {
              top: (start - gridStartMin) * PX_PER_MINUTE,
              height: Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT),
              backgroundColor: `${SESSION_ACCENT}1F`,
              borderColor: SESSION_ACCENT,
            },
          ]}>
          <Text variant="caption" numberOfLines={1} style={{ color: SESSION_ACCENT }}>
            {session.bookedCount}/{session.capacity}
          </Text>
        </View>
      ))}

      {/* Class / event / resource blocks from the schedule feed — read-only,
          named, accent-coloured. Disjoint from `sessions` (different feed). */}
      {scheduleBlocks.map(({ block, start, end }) => {
        const height = Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT);
        return (
          <View
            key={block.id}
            pointerEvents="none"
            accessibilityLabel={`${block.title}${
              block.capacityLabel ? `, ${block.capacityLabel}` : ''
            }`}
            style={[
              styles.scheduleBlock,
              {
                top: (start - gridStartMin) * PX_PER_MINUTE,
                height,
                backgroundColor: hexToRgba(block.accent, 0.12),
                borderColor: block.accent,
              },
            ]}>
            <Text variant="caption" numberOfLines={1} style={{ color: block.accent }}>
              {block.title}
            </Text>
            {height >= 40 && block.capacityLabel ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {block.capacityLabel}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Appointment blocks. Own-venue movable bookings are hold-draggable
          (vertical = move time, bottom edge = resize) via the same proven block
          the single grid uses; a plain swipe still scrolls/pages. Linked-venue
          bookings are read-only — a static, tap-to-open card. */}
      {positioned.map((item) => {
        if (column.linked) {
          const widthPct = 100 / item.laneCount;
          return (
            <View
              key={item.booking.id}
              style={[
                styles.blockWrap,
                {
                  top: item.top,
                  height: item.height,
                  left: `${item.laneIndex * widthPct}%` as const,
                  width: `${widthPct}%` as const,
                },
              ]}>
              <AppointmentBlock
                id={item.booking.id}
                guestName={item.booking.guestName}
                serviceName={item.booking.serviceName}
                timeLabel={item.timeLabel}
                status={item.booking.status}
                clientArrivedAt={item.booking.client_arrived_at}
                staffAttendanceConfirmedAt={item.booking.staff_attendance_confirmed_at}
                guestAttendanceConfirmedAt={item.booking.guest_attendance_confirmed_at}
                height={item.height}
                laneIndex={item.laneIndex}
                laneCount={item.laneCount}
                onPress={onBlockPress}
              />
            </View>
          );
        }
        return (
          <DraggableAppointmentBlock
            key={item.booking.id}
            id={item.booking.id}
            guestName={item.booking.guestName}
            serviceName={item.booking.serviceName}
            timeLabel={item.timeLabel}
            status={item.booking.status}
            draggable={MOVABLE_STATUSES.has(item.booking.status)}
            clientArrivedAt={item.booking.client_arrived_at}
            staffAttendanceConfirmedAt={item.booking.staff_attendance_confirmed_at}
            guestAttendanceConfirmedAt={item.booking.guest_attendance_confirmed_at}
            top={item.top}
            height={item.height}
            laneIndex={item.laneIndex}
            laneCount={item.laneCount}
            startTime={item.booking.startTime}
            durationMinutes={item.durationMinutes}
            onPress={onBlockPress}
            actionPending={pendingActionIds?.has(item.booking.id) ?? false}
            onDragReschedule={onDragReschedule}
            onDragResize={onDragResize}
            onDragConflictReject={onDragConflictReject}
            onDragMoveToColumn={onDragMoveToColumn}
            crossColumnSourceIndex={columnIndex}
            crossColumnCount={ownColumnCount}
            crossColumnPitch={COLUMN_PITCH}
            crossColumnIds={ownColumnIds}
            liftedColumn={liftedColumn}
            dragAbsX={dragAbsX}
            autoScrollDelta={autoScrollDelta}
            busyRanges={busyRanges}
            workingRanges={workingRanges}
          />
        );
      })}
    </Animated.View>
  );
}

const HEADER_HEIGHT = 32;

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  row: {
    flexDirection: 'row',
  },
  gutter: {
    width: TIME_GUTTER_WIDTH,
    marginTop: HEADER_HEIGHT,
  },
  gutterLabel: {
    position: 'absolute',
    right: spacing.sm,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  headerRow: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
  },
  headerCell: {
    width: COLUMN_WIDTH,
    marginRight: COLUMN_GAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  closedBand: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  closedLabel: {
    marginTop: 4,
    marginLeft: spacing.xs,
    opacity: 0.7,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    zIndex: 20,
  },
  columnsRow: {
    flexDirection: 'row',
  },
  column: {
    width: COLUMN_WIDTH,
    marginRight: COLUMN_GAP,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  blockWrap: {
    position: 'absolute',
    paddingHorizontal: 1,
  },
  overlay: {
    position: 'absolute',
    left: spacing.xs,
    right: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  session: {
    position: 'absolute',
    left: spacing.xs,
    right: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  scheduleBlock: {
    position: 'absolute',
    left: spacing.xs,
    right: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    // Heavier left edge = the accent bar (matches the day grid's session bar).
    borderLeftWidth: 3,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    justifyContent: 'center',
  },
});
