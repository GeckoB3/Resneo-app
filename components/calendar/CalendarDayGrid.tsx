import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
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
  type LaneInput,
} from '@/components/calendar/grid-layout';
import { Text } from '@/components/ui/Text';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CalendarGridBooking, CalendarGridWorkingHours } from '@/types/calendar-grid';

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

type CalendarDayGridProps = {
  bookings: CalendarGridBooking[];
  workingHours: CalendarGridWorkingHours[];
  /** Breaks/blocks for this practitioner+day — render as non-bookable overlays. */
  timeBlocks?: CalendarTimeBlock[];
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
};

const DEFAULT_DURATION_MINUTES = 30;
// Correct for paddingTop of scrollContent when computing tap time.
const PADDING_TOP = spacing.sm;

/** Scrollable single-day, single-practitioner time grid. */
export function CalendarDayGrid({
  bookings,
  workingHours,
  timeBlocks = [],
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
}: CalendarDayGridProps) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollViewType | null>(null);

  const { startHour, endHour, totalHeight, positioned, positionedBlocks } = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    for (const wh of workingHours) {
      ranges.push({ start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) });
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

    const bounds = computeGridBounds(ranges);
    const gridStartMin = bounds.startHour * 60;
    const total = (bounds.endHour - bounds.startHour) * 60 * PX_PER_MINUTE;

    // True-to-duration positioning with a small visual minimum; the inflated
    // visual extents feed the lane packer so cards that would collide render
    // side-by-side (web lane model) instead of stacking.
    const laneInputs: LaneInput[] = [];
    const prelim = rawBlocks.map(({ booking, start, end }) => {
      const top = (start - gridStartMin) * PX_PER_MINUTE;
      const height = Math.max((end - start) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT);
      laneInputs.push({ id: booking.id, top, bottom: top + height });
      return { booking, start, end, top, height };
    });
    const lanes = computeLaneLayouts(laneInputs);

    const blocks: PositionedBooking[] = prelim.map(({ booking, start, end, top, height }) => {
      const lane = lanes.get(booking.id) ?? { laneIndex: 0, laneCount: 1 };
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

    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: total,
      positioned: blocks,
      positionedBlocks: overlayBlocks,
    };
  }, [bookings, workingHours, timeBlocks]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

  // Scroll to the current time once on mount (web parity: scroll-to-now).
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
      const y = event.nativeEvent.locationY - PADDING_TOP;
      const minutes = startHour * 60 + y / PX_PER_MINUTE;
      const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
      onEmptyPress(minutesToTime(Math.max(0, snapped)));
    },
    [startHour, onEmptyPress],
  );

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
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
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'] + spacing.xl,
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
