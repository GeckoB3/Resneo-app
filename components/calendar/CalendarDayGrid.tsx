import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ScrollView as ScrollViewType,
} from 'react-native';

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
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CalendarGridBooking,
  CalendarGridSession,
  CalendarGridWorkingHours,
} from '@/types/calendar-grid';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

/** Indigo accent for class/event capacity blocks — distinct from booking hues. */
const SESSION_ACCENT = '#6366F1';

type PositionedBooking = {
  booking: CalendarGridBooking;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
  durationMinutes: number;
  timeLabel: string;
};

/** Blocked-out time (break / leave / manual block) rendered as a grey overlay. */
export type CalendarTimeBlock = {
  id: string;
  /** HH:mm[:ss] */
  start: string;
  end: string;
  label?: string | null;
  /** When set, tapping the block calls onBlockTimeBlockPress instead of swallowing. */
  isEditable?: boolean;
};

type PositionedTimeBlock = {
  block: CalendarTimeBlock;
  top: number;
  height: number;
  timeLabel: string;
};

type PositionedSession = {
  session: CalendarGridSession;
  top: number;
  height: number;
  timeLabel: string;
};

type PositionedScheduleBlock = {
  block: CalendarScheduleBlock;
  top: number;
  height: number;
  timeLabel: string;
};

/** Half-open minute range used for drag-conflict detection. */
export type BusyRange = { start: number; end: number };

/** Statuses that occupy the practitioner's wall for conflict math (web parity:
 *  Cancelled/No-Show bookings are excluded). Mutability (which bookings may be
 *  dragged) is a stricter set — see MOVABLE_STATUSES. */
const CONFLICT_IGNORED_STATUSES = new Set(['Cancelled', 'No-Show']);

/**
 * Statuses whose blocks may be hold-dragged / resized (web parity:
 * Pending|Booked|Confirmed|Seated — the app shows "Seated" as "Started"). A
 * Completed/No-Show/Cancelled block is rendered but its gesture is disabled, so
 * the move can't even start. The parent ALSO refuses these in its drag handlers.
 */
const MOVABLE_STATUSES = new Set(['Pending', 'Booked', 'Confirmed', 'Seated']);

type CalendarDayGridProps = {
  bookings: CalendarGridBooking[];
  /**
   * UNFILTERED booking set for drag-conflict detection only. The visible
   * `bookings` may be narrowed by the status filter, but the overlap guard must
   * still see hidden bookings (web parity: conflict uses the full grid set).
   * Falls back to `bookings` when not supplied. Sessions + scheduleBlocks are
   * also folded into the busy ranges, so the guard sees classes/events/resources
   * too — not just appointments + manual blocks.
   */
  conflictBookings?: CalendarGridBooking[];
  workingHours: CalendarGridWorkingHours[];
  /** Breaks/blocks for this practitioner+day — render as non-bookable overlays. */
  timeBlocks?: CalendarTimeBlock[];
  /** Class/event capacity blocks from the grid payload (rendered as indigo). */
  sessions?: CalendarGridSession[];
  /**
   * CLASS / EVENT / RESOURCE blocks from the /api/venue/schedule feed for this
   * calendar+day — read-only, named, accent-coloured. Disjoint from `sessions`
   * (different feed) so they never double-render.
   */
  scheduleBlocks?: CalendarScheduleBlock[];
  /** Venue open/closed state for this date → shades the closed (out-of-hours) time. */
  venueHours?: VenueDayHours;
  /**
   * User's visible-window override (web parity: From/Until). Widens the grid to
   * the pinned window without ever clipping a booking outside it. Null/omitted →
   * auto-fit only.
   */
  windowOverride?: GridWindowOverride | null;
  /** Current time in minutes-since-midnight, or null when not viewing today. */
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  /** Called when a quick-status tray button is tapped on an appointment block. */
  onStatusChange?: (bookingId: string, status: string) => void;
  /** Called when the arrived toggle is tapped on an appointment block. */
  onArrivalToggle?: (bookingId: string, arrived: boolean) => void;
  /** Set of booking ids currently in flight for status/arrival changes. */
  pendingActionIds?: Set<string>;
  /** Per-booking compliance flags (bookingId → flag) for the corner dot. */
  complianceFlags?: Record<string, ComplianceBookingFlag>;
  onEmptyPress: (time: string) => void;
  /** Called when a user taps an editable time block (for edit/delete). */
  onBlockTimeBlockPress?: (blockId: string) => void;
  /** Called when the user completes a hold-drag-to-reschedule on a block. */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /** Called when the user hold-drags the bottom edge to change duration. */
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
  /** Called when a drag/resize is refused for overlapping another block. */
  onDragConflictReject?: () => void;
  /** Pull-to-refresh — true while the grid query is refetching. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Render at full intrinsic height inside a plain View instead of the grid's
   * own vertical ScrollView, letting a PARENT scroll container own the vertical
   * scroll. Stacking this grid's same-axis ScrollView inside another vertical
   * ScrollView (the calendar's "All incl. linked" view, the linked-calendar
   * screen) makes the parent unscrollable and hides the grids below it.
   * `refreshing`/`onRefresh` are then owned by the parent and ignored here.
   */
  embedded?: boolean;
};

const DEFAULT_DURATION_MINUTES = 30;

/** Scrollable single-day, single-practitioner time grid. */
export function CalendarDayGrid({
  bookings,
  conflictBookings,
  workingHours,
  timeBlocks = [],
  sessions = [],
  scheduleBlocks = [],
  venueHours,
  windowOverride,
  nowMinutes,
  onBlockPress,
  onStatusChange,
  onArrivalToggle,
  pendingActionIds,
  complianceFlags,
  onEmptyPress,
  onBlockTimeBlockPress,
  onDragReschedule,
  onDragResize,
  onDragConflictReject,
  refreshing = false,
  onRefresh,
  embedded = false,
}: CalendarDayGridProps) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollViewType | null>(null);

  const {
    startHour,
    endHour,
    totalHeight,
    positioned,
    positionedBlocks,
    positionedSessions,
    positionedScheduleBlocks,
    workingRanges,
  } = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    const working: BusyRange[] = [];
    for (const wh of workingHours) {
      const r = { start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) };
      ranges.push(r);
      working.push(r);
    }

    const rawBlocks = bookings.map((booking) => {
      const start = timeToMinutes(booking.startTime);
      let end = booking.endTime ? timeToMinutes(booking.endTime) : start + DEFAULT_DURATION_MINUTES;
      if (end <= start) {
        end = start + DEFAULT_DURATION_MINUTES;
      }
      ranges.push({ start, end });
      return { booking, start, end };
    });

    const rawTimeBlocks = timeBlocks
      .map((block) => {
        const start = timeToMinutes(block.start);
        const end = timeToMinutes(block.end);
        return { block, start, end };
      })
      .filter(({ start, end }) => end > start);
    for (const { start, end } of rawTimeBlocks) {
      ranges.push({ start, end });
    }

    const rawSessions = sessions
      .map((session) => {
        const start = timeToMinutes(session.startTime);
        const end = timeToMinutes(session.endTime);
        return { session, start, end };
      })
      .filter(({ start, end }) => end > start);
    for (const { start, end } of rawSessions) {
      ranges.push({ start, end });
    }

    const rawScheduleBlocks = scheduleBlocks
      .map((block) => {
        const start = timeToMinutes(block.startTime);
        const end = timeToMinutes(block.endTime);
        return { block, start, end };
      })
      .filter(({ start, end }) => end > start);
    for (const { start, end } of rawScheduleBlocks) {
      ranges.push({ start, end });
    }

    const bounds = computeGridBounds(ranges, windowOverride);
    const gridStartMin = bounds.startHour * 60;
    const total = (bounds.endHour - bounds.startHour) * 60 * PX_PER_MINUTE;

    // Pack lanes on TRUE minute ranges so non-overlapping short bookings stay
    // full-width — the visual min-height is applied AFTER lane assignment so it
    // never inflates extents into false overlaps (web lane model).
    const laneInputs: LaneInput[] = rawBlocks.map(({ booking, start, end }) => ({
      id: booking.id,
      top: (start - gridStartMin) * PX_PER_MINUTE,
      bottom: (end - gridStartMin) * PX_PER_MINUTE,
    }));
    const lanes = computeLaneLayouts(laneInputs);

    const blocks: PositionedBooking[] = rawBlocks.map(({ booking, start, end }) => {
      const lane = lanes.get(booking.id) ?? { laneIndex: 0, laneCount: 1 };
      const top = (start - gridStartMin) * PX_PER_MINUTE;
      // Visual floor for tappability — applied only now, post-lane-packing.
      const height = Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT);
      return {
        booking,
        top,
        height,
        laneIndex: lane.laneIndex,
        laneCount: lane.laneCount,
        durationMinutes: Math.max(end - start, TAP_SNAP_MINUTES),
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
      };
    });

    const overlayBlocks: PositionedTimeBlock[] = rawTimeBlocks.map(({ block, start, end }) => ({
      block,
      top: (start - gridStartMin) * PX_PER_MINUTE,
      height: Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT),
      timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
    }));

    const sessionItems: PositionedSession[] = rawSessions.map(({ session, start, end }) => ({
      session,
      top: (start - gridStartMin) * PX_PER_MINUTE,
      height: Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT),
      timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
    }));

    const scheduleItems: PositionedScheduleBlock[] = rawScheduleBlocks.map(
      ({ block, start, end }) => ({
        block,
        top: (start - gridStartMin) * PX_PER_MINUTE,
        height: Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT),
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
      }),
    );

    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: total,
      positioned: blocks,
      positionedBlocks: overlayBlocks,
      positionedSessions: sessionItems,
      positionedScheduleBlocks: scheduleItems,
      workingRanges: working,
    };
  }, [bookings, workingHours, timeBlocks, sessions, scheduleBlocks, windowOverride]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  // Venue-closed minute-ranges within the visible window (out-of-hours / closed day).
  const closedRanges = useMemo(
    () => venueClosedRanges(venueHours, startHour * 60, endHour * 60),
    [venueHours, startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

  // Scroll to the current time once per grid instance (web parity:
  // scroll-to-now). The parent keys this grid on `${calendar}:${day}`, so it
  // remounts — and this ref resets — when you switch calendar or return to
  // today, re-running the scroll. The guard only blocks a repeat within the
  // same instance (e.g. the 60s now-line tick nudging `nowTop`).
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || nowTop == null) return;
    didAutoScroll.current = true;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, nowTop - 140), animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [nowTop]);

  const handleBackgroundPress = useCallback(
    (event: GestureResponderEvent) => {
      // locationY is relative to the inner grid View (which already sits below the
      // scroll padding) — the same space the hour lines use, so no padding offset.
      const y = event.nativeEvent.locationY;
      const minutes = startHour * 60 + y / PX_PER_MINUTE;
      const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
      onEmptyPress(minutesToTime(Math.max(0, snapped)));
    },
    [startHour, onEmptyPress],
  );

  // Busy minute-ranges for drag-conflict detection, keyed by id so a dragged
  // block can exclude itself. Built from the FULL picture — NOT the visible
  // (status-filtered) `positioned` list — so the overlap guard sees:
  //   · every booking on the day (conflictBookings, unfiltered; falls back to
  //     the visible set when the parent doesn't supply it), minus Cancelled/
  //     No-Show which don't hold the wall (web parity),
  //   · manual time blocks (breaks/leave),
  //   · class/event capacity sessions, and
  //   · class/event/resource schedule blocks.
  // The status filter therefore stays PURELY visual — it hides blocks from view
  // without hiding them from conflict math.
  const busyRanges = useMemo<(BusyRange & { id: string })[]>(() => {
    const out: (BusyRange & { id: string })[] = [];
    const conflictSource = conflictBookings ?? bookings;
    for (const booking of conflictSource) {
      if (CONFLICT_IGNORED_STATUSES.has(booking.status)) continue;
      const start = timeToMinutes(booking.startTime);
      let end = booking.endTime ? timeToMinutes(booking.endTime) : start + DEFAULT_DURATION_MINUTES;
      if (end <= start) end = start + DEFAULT_DURATION_MINUTES;
      out.push({ id: booking.id, start, end });
    }
    for (const block of timeBlocks) {
      const start = timeToMinutes(block.start);
      const end = timeToMinutes(block.end);
      if (end > start) out.push({ id: block.id, start, end });
    }
    for (const session of sessions) {
      const start = timeToMinutes(session.startTime);
      const end = timeToMinutes(session.endTime);
      if (end > start) out.push({ id: session.id, start, end });
    }
    for (const block of scheduleBlocks) {
      const start = timeToMinutes(block.startTime);
      const end = timeToMinutes(block.endTime);
      if (end > start) out.push({ id: block.id, start, end });
    }
    return out;
  }, [conflictBookings, bookings, timeBlocks, sessions, scheduleBlocks]);

  // The time grid itself: one full-day-height layer holding the hour lines,
  // closed-time shading, the now-line and the positioned appointment blocks.
  const grid = (
      <View style={{ height: totalHeight }}>
        {/* Empty-area tap layer (blocks render above and capture their own taps). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackgroundPress}
          accessibilityLabel="Tap an empty slot to add a booking or block"
        />

        {/* Hour rows: label + line + alternating shading + half-hour line. */}
        {hours.map((hour, index) => {
          const top = (hour - startHour) * 60 * PX_PER_MINUTE;
          const isLast = hour === endHour;
          return (
            <View key={hour} style={[styles.hourRow, { top }]} pointerEvents="none">
              <View style={styles.hourLineRow}>
                <Text variant="caption" tone="muted" style={styles.hourLabel}>
                  {hourLabel(hour)}
                </Text>
                <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
              </View>
              {!isLast ? (
                <>
                  {/* Subtle alternate-hour banding (web parity). */}
                  {index % 2 === 1 ? (
                    <View
                      style={[
                        styles.hourBand,
                        { backgroundColor: colors.text, opacity: 0.025 },
                      ]}
                    />
                  ) : null}
                  {/* Lighter half-hour line. */}
                  <View
                    style={[
                      styles.halfHourLine,
                      { top: 30 * PX_PER_MINUTE, backgroundColor: colors.border },
                    ]}
                  />
                </>
              ) : null}
            </View>
          );
        })}

        {/* Venue-closed shading — out-of-hours / closed-day time. A faint band
            behind everything; pointerEvents none so a slot can still be tapped
            to book anyway. */}
        {closedRanges.map((r) => {
          const top = (r.start - startHour * 60) * PX_PER_MINUTE;
          const height = (r.end - r.start) * PX_PER_MINUTE;
          return (
            <View
              key={`closed-${r.start}-${r.end}`}
              pointerEvents="none"
              accessibilityLabel={`Closed ${minutesToTime(r.start)}–${minutesToTime(r.end)}`}
              style={[styles.closedBand, { top, height, backgroundColor: hexToRgba(colors.text, 0.06) }]}>
              {height >= 26 ? (
                <Text variant="caption" tone="muted" style={styles.closedLabel}>
                  Closed
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* Blocked-time overlays */}
        {positionedBlocks.map((item) => (
          <Pressable
            key={item.block.id}
            accessibilityLabel={`Blocked ${item.timeLabel}`}
            onPress={() => {
              if (item.block.isEditable && onBlockTimeBlockPress) {
                onBlockTimeBlockPress(item.block.id);
              }
            }}
            style={[
              styles.blockedOverlay,
              {
                top: item.top,
                height: item.height,
                borderColor: colors.border,
              },
            ]}>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {item.block.label?.trim() || 'Blocked'} · {item.timeLabel}
            </Text>
            {item.block.isEditable && item.height >= 40 ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={styles.editHint}>
                Tap to edit
              </Text>
            ) : null}
          </Pressable>
        ))}

        {/* Class / event capacity blocks (indigo) — read-only, distinct from
            appointment bars. Render below the now-line and appointment layer. */}
        {positionedSessions.map((item) => (
          <View
            key={item.session.id}
            pointerEvents="none"
            accessibilityLabel={`Class ${item.timeLabel}, ${item.session.bookedCount} of ${item.session.capacity} booked`}
            style={[
              styles.sessionBlock,
              {
                top: item.top,
                height: item.height,
                backgroundColor: `${SESSION_ACCENT}1F`,
                borderColor: SESSION_ACCENT,
              },
            ]}>
            <View style={[styles.sessionAccent, { backgroundColor: SESSION_ACCENT }]} />
            <View style={styles.sessionBody}>
              <Text variant="caption" numberOfLines={1} style={[styles.sessionLabel, { color: SESSION_ACCENT }]}>
                {item.session.bookedCount}/{item.session.capacity} booked
              </Text>
              {item.height >= 40 ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.timeLabel}
                </Text>
              ) : null}
            </View>
          </View>
        ))}

        {/* Class / event / resource blocks from the schedule feed — read-only,
            named, accent-coloured, with the capacity/uptake line when known.
            Disjoint from `sessions` above (different feed), so both render
            without double-counting. */}
        {positionedScheduleBlocks.map((item) => (
          <View
            key={item.block.id}
            pointerEvents="none"
            accessibilityLabel={`${item.block.title}${
              item.block.capacityLabel ? `, ${item.block.capacityLabel}` : ''
            }, ${item.timeLabel}`}
            style={[
              styles.sessionBlock,
              {
                top: item.top,
                height: item.height,
                backgroundColor: hexToRgba(item.block.accent, 0.12),
                borderColor: item.block.accent,
              },
            ]}>
            <View style={[styles.sessionAccent, { backgroundColor: item.block.accent }]} />
            <View style={styles.sessionBody}>
              <Text
                variant="caption"
                numberOfLines={1}
                style={[styles.sessionLabel, { color: item.block.accent }]}>
                {item.block.title}
              </Text>
              {item.height >= 40 && item.block.capacityLabel ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.block.capacityLabel}
                </Text>
              ) : item.height >= 40 ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.timeLabel}
                </Text>
              ) : null}
            </View>
          </View>
        ))}

        {/* Now indicator */}
        {nowTop != null ? (
          <View style={[styles.nowLine, { top: nowTop }]} pointerEvents="none">
            <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
            <View style={[styles.nowBar, { backgroundColor: colors.danger }]} />
          </View>
        ) : null}

        {/* Appointment blocks — positioned within the content layer so lane
            percentages are relative to the bookable column, not the gutter. */}
        <View style={styles.blocksLayer} pointerEvents="box-none">
          {positioned.map((item) => (
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
              onStatusChange={onStatusChange}
              onArrivalToggle={onArrivalToggle}
              actionPending={pendingActionIds?.has(item.booking.id) ?? false}
              complianceFlag={complianceFlags?.[item.booking.id]}
              onDragReschedule={onDragReschedule}
              onDragResize={onDragResize}
              onDragConflictReject={onDragConflictReject}
              busyRanges={busyRanges}
              workingRanges={workingRanges}
            />
          ))}
        </View>
      </View>
  );

  // Embedded: hand vertical scrolling to the parent. A grid that keeps its own
  // vertical ScrollView when stacked inside another vertical ScrollView swallows
  // the parent's pan, leaving the grids below it unreachable. Horizontal column
  // scrolling, where present, is orthogonal and unaffected.
  if (embedded) {
    return <View style={styles.embeddedContent}>{grid}</View>;
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
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
      {grid}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  embeddedContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 60 * PX_PER_MINUTE,
  },
  hourLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: {
    width: TIME_GUTTER_WIDTH,
    paddingRight: spacing.sm,
    textAlign: 'right',
    marginTop: -7,
    fontVariant: ['tabular-nums'],
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  hourBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: TIME_GUTTER_WIDTH,
    right: 0,
  },
  halfHourLine: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH,
    right: 0,
    height: StyleSheet.hairlineWidth,
    opacity: 0.55,
  },
  closedBand: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH,
    right: 0,
  },
  closedLabel: {
    marginTop: 4,
    marginLeft: spacing.sm,
    opacity: 0.7,
  },
  blockedOverlay: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    justifyContent: 'flex-start',
  },
  editHint: {
    marginTop: 1,
    opacity: 0.6,
  },
  sessionBlock: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sessionAccent: {
    width: 3,
  },
  sessionBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  sessionLabel: {
    fontVariant: ['tabular-nums'],
  },
  nowLine: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH - 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nowBar: {
    flex: 1,
    height: 2,
  },
  blocksLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
  },
});
