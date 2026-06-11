import { useCallback, useMemo, useRef, type RefObject } from 'react';
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
  hourLabel,
  minutesToTime,
  MIN_BLOCK_MINUTES,
  PX_PER_MINUTE,
  TAP_SNAP_MINUTES,
  TIME_GUTTER_WIDTH,
  timeToMinutes,
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
  onBlockLongPress?: (bookingId: string) => void;
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
  /**
   * Shared ScrollView ref — when set the CalendarDayGrid uses this ref instead
   * of creating its own (multi-column layout wires all columns to the same
   * scroll position via parent-managed synced scroll).
   */
  scrollRef?: RefObject<ScrollViewType | null>;
  /**
   * When true the time-gutter column is suppressed (the parent renders its own
   * shared gutter instead). Used by MultiColumnDayGrid.
   */
  hideGutter?: boolean;
  /**
   * Extra grid bounds to honour when computing start/end hours.
   * Multi-column layout passes all columns' ranges so every column shares the
   * same vertical extent.
   */
  sharedBoundsRanges?: { start: number; end: number }[];
  /**
   * Called when the user completes a drag-to-reschedule on a block.
   * The parent handles committing via useRescheduleBooking.
   */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /**
   * Called when the user drags the resize handle to change a booking's duration.
   */
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
  onBlockLongPress,
  onStatusChange,
  onArrivalToggle,
  pendingActionIds,
  complianceFlags,
  onEmptyPress,
  onBlockTimeBlockPress,
  scrollRef: externalScrollRef,
  hideGutter = false,
  sharedBoundsRanges,
  onDragReschedule,
  onDragResize,
}: CalendarDayGridProps) {
  const { colors } = useTheme();
  const internalScrollRef = useRef<ScrollViewType | null>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;

  const { startHour, endHour, totalHeight, positioned, positionedBlocks } = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    for (const wh of workingHours) {
      ranges.push({ start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) });
    }
    if (sharedBoundsRanges) {
      for (const r of sharedBoundsRanges) ranges.push(r);
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

    const blocks: PositionedBooking[] = rawBlocks.map(({ booking, start, end }) => {
      const durationMin = Math.max(end - start, MIN_BLOCK_MINUTES);
      return {
        booking,
        top: (start - gridStartMin) * PX_PER_MINUTE,
        height: durationMin * PX_PER_MINUTE,
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
      };
    });

    const overlayBlocks: PositionedTimeBlock[] = rawTimeBlocks.map(({ block, start, end }) => ({
      block,
      top: (start - gridStartMin) * PX_PER_MINUTE,
      height: Math.max(end - start, MIN_BLOCK_MINUTES) * PX_PER_MINUTE,
      timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
    }));

    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: total,
      positioned: blocks,
      positionedBlocks: overlayBlocks,
    };
  }, [bookings, workingHours, timeBlocks, sharedBoundsRanges]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

  const handleBackgroundPress = useCallback(
    (event: GestureResponderEvent) => {
      const y = event.nativeEvent.locationY - PADDING_TOP;
      const minutes = startHour * 60 + y / PX_PER_MINUTE;
      const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
      onEmptyPress(minutesToTime(Math.max(0, snapped)));
    },
    [startHour, onEmptyPress],
  );

  // When hideGutter=true, the appointment blocks and now-line left-offset by
  // the gutter width shift LEFT so they start at 0. The gutter is rendered
  // by the parent MultiColumnDayGrid.
  const blockLeft = hideGutter ? spacing.xs : TIME_GUTTER_WIDTH + spacing.xs;
  const nowLineLeft = hideGutter ? 0 : TIME_GUTTER_WIDTH - 4;

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

        {/* Hour lines + labels */}
        {hours.map((hour) => {
          const top = (hour - startHour) * 60 * PX_PER_MINUTE;
          return (
            <View key={hour} style={[styles.hourRow, { top }, { pointerEvents: 'none' }]}>
              {!hideGutter ? (
                <Text variant="caption" tone="muted" style={styles.hourLabel}>
                  {hourLabel(hour)}
                </Text>
              ) : null}
              <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
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
                left: blockLeft,
                borderColor: colors.border,
              },
            ]}>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {item.block.label?.trim() || 'Blocked'} · {item.timeLabel}
            </Text>
            {item.block.isEditable ? (
              <Text variant="caption" tone="muted" numberOfLines={1} style={styles.editHint}>
                Tap to edit
              </Text>
            ) : null}
          </Pressable>
        ))}

        {/* Now indicator */}
        {nowTop != null ? (
          <View
            style={[
              styles.nowLine,
              { top: nowTop, left: nowLineLeft, pointerEvents: 'none' },
            ]}>
            <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
            <View style={[styles.nowBar, { backgroundColor: colors.danger }]} />
          </View>
        ) : null}

        {/* Appointment blocks */}
        {positioned.map((item) => {
          const bookingStartMin = timeToMinutes(item.booking.startTime);
          const bookingEndMin = item.booking.endTime
            ? timeToMinutes(item.booking.endTime)
            : bookingStartMin + DEFAULT_DURATION_MINUTES;
          const bookingDuration = Math.max(
            DEFAULT_DURATION_MINUTES,
            bookingEndMin - bookingStartMin,
          );
          return (
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
              startTime={item.booking.startTime}
              durationMinutes={bookingDuration}
              onPress={onBlockPress}
              onLongPress={onBlockLongPress}
              onStatusChange={onStatusChange}
              onArrivalToggle={onArrivalToggle}
              actionPending={pendingActionIds?.has(item.booking.id) ?? false}
              complianceFlag={complianceFlags?.[item.booking.id]}
              blockLeft={blockLeft}
              onDragReschedule={onDragReschedule}
              onDragResize={onDragResize}
            />
          );
        })}
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
  blockedOverlay: {
    position: 'absolute',
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
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
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
});
