import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';
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
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CalendarGridBooking, CalendarGridWorkingHours } from '@/types/calendar-grid';

type PositionedBooking = {
  booking: CalendarGridBooking;
  top: number;
  height: number;
  color: string;
  timeLabel: string;
};

type CalendarDayGridProps = {
  bookings: CalendarGridBooking[];
  workingHours: CalendarGridWorkingHours[];
  /** Fallback colour (the practitioner's) when a booking has none. */
  practitionerColor: string;
  /** Current time in minutes-since-midnight, or null when not viewing today. */
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  onBlockLongPress?: (bookingId: string) => void;
  onEmptyPress: (time: string) => void;
};

const DEFAULT_DURATION_MINUTES = 30;

/** Scrollable single-day, single-practitioner time grid. */
export function CalendarDayGrid({
  bookings,
  workingHours,
  practitionerColor,
  nowMinutes,
  onBlockPress,
  onBlockLongPress,
  onEmptyPress,
}: CalendarDayGridProps) {
  const { colors } = useTheme();

  const { startHour, endHour, totalHeight, positioned } = useMemo(() => {
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

    const bounds = computeGridBounds(ranges);
    const gridStartMin = bounds.startHour * 60;
    const total = (bounds.endHour - bounds.startHour) * 60 * PX_PER_MINUTE;

    const blocks: PositionedBooking[] = rawBlocks.map(({ booking, start, end }) => {
      const durationMin = Math.max(end - start, MIN_BLOCK_MINUTES);
      return {
        booking,
        top: (start - gridStartMin) * PX_PER_MINUTE,
        height: durationMin * PX_PER_MINUTE,
        color: booking.colour ?? practitionerColor,
        timeLabel: `${minutesToTime(start)}–${minutesToTime(end)}`,
      };
    });

    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: total,
      positioned: blocks,
    };
  }, [bookings, workingHours, practitionerColor]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

  function handleBackgroundPress(event: GestureResponderEvent) {
    const y = event.nativeEvent.locationY;
    const minutes = startHour * 60 + y / PX_PER_MINUTE;
    const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
    onEmptyPress(minutesToTime(snapped));
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={{ height: totalHeight }}>
        {/* Empty-area tap layer (blocks render above and capture their own taps). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackgroundPress}
          accessibilityLabel="Tap an empty slot to add a booking"
        />

        {hours.map((hour) => {
          const top = (hour - startHour) * 60 * PX_PER_MINUTE;
          return (
            <View key={hour} pointerEvents="none" style={[styles.hourRow, { top }]}>
              <Text variant="caption" tone="muted" style={styles.hourLabel}>
                {hourLabel(hour)}
              </Text>
              <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
            </View>
          );
        })}

        {nowTop != null ? (
          <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}>
            <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
            <View style={[styles.nowBar, { backgroundColor: colors.danger }]} />
          </View>
        ) : null}

        {positioned.map((item) => (
          <AppointmentBlock
            key={item.booking.id}
            id={item.booking.id}
            guestName={item.booking.guestName}
            serviceName={item.booking.serviceName}
            timeLabel={item.timeLabel}
            status={item.booking.status}
            color={item.color}
            top={item.top}
            height={item.height}
            onPress={onBlockPress}
            onLongPress={onBlockLongPress}
          />
        ))}
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
  nowLine: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH - 4,
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
