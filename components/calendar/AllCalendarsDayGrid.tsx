/**
 * AllCalendarsDayGrid
 *
 * Reception-parity multi-calendar day view: one column per practitioner for a
 * single date, sharing a sticky left time-gutter and a single now-line. The
 * columns scroll horizontally; the gutter and grid lines stay put.
 *
 * Drag/resize is intentionally NOT done here — the single-calendar grid remains
 * the place for hold-drag move/resize, which keeps the busiest view simple and
 * avoids per-column gesture (worklet) bookkeeping. Cross-practitioner moves are
 * instead reachable via a worklet-free LONG-PRESS on a block (onBlockLongPress),
 * which the screen turns into a "Move to practitioner" chooser. Tapping a block
 * still opens its detail; tapping an empty slot still starts a new booking.
 */

import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppointmentBlock } from '@/components/calendar/AppointmentBlock';
import type { CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';
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
const PADDING_TOP = spacing.sm;
const SESSION_ACCENT = '#6366F1';

/** No-op for the inner card's onPress when the outer Pressable owns the tap. */
const noop = (): void => {};

/** One practitioner's day data, as assembled by the calendar screen. */
export type AllCalendarColumn = {
  calendarId: string;
  calendarName: string;
  workingHours: CalendarGridWorkingHours[];
  bookings: CalendarGridBooking[];
  sessions: CalendarGridSession[];
  timeBlocks: CalendarTimeBlock[];
  /** Class/event/resource blocks (schedule feed) for this column's date. */
  scheduleBlocks: CalendarScheduleBlock[];
};

type PositionedBooking = {
  booking: CalendarGridBooking;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
  timeLabel: string;
};

type AllCalendarsDayGridProps = {
  calendars: AllCalendarColumn[];
  /** Current time in minutes-since-midnight, or null when not viewing today. */
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  /** Empty-slot tap → carries the column's practitioner id + the snapped time. */
  onEmptyPress: (practitionerId: string, time: string) => void;
  /**
   * Long-press a booking → carries the booking id + the column (current
   * practitioner) it sits in, so the screen can offer a "move to practitioner"
   * chooser. Worklet-free (plain Pressable onLongPress) — no drag here.
   */
  onBlockLongPress?: (bookingId: string, fromPractitionerId: string) => void;
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
  nowMinutes,
  onBlockPress,
  onEmptyPress,
  onBlockLongPress,
  refreshing = false,
  onRefresh,
}: AllCalendarsDayGridProps) {
  const { colors } = useTheme();

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
    const bounds = computeGridBounds(ranges);
    return {
      startHour: bounds.startHour,
      endHour: bounds.endHour,
      totalHeight: (bounds.endHour - bounds.startHour) * 60 * PX_PER_MINUTE,
      gridStartMin: bounds.startHour * 60,
    };
  }, [calendars]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop =
    nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Column headers (practitioner names) */}
            <View style={styles.headerRow}>
              {calendars.map((cal) => (
                <View key={cal.calendarId} style={[styles.headerCell, { borderColor: colors.border }]}>
                  <Text variant="label" numberOfLines={1}>
                    {cal.calendarName}
                  </Text>
                </View>
              ))}
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

              <View style={styles.columnsRow}>
                {calendars.map((cal) => (
                  <DayColumn
                    key={cal.calendarId}
                    column={cal}
                    gridStartMin={gridStartMin}
                    startHour={startHour}
                    onBlockPress={onBlockPress}
                    onEmptyPress={onEmptyPress}
                    onBlockLongPress={onBlockLongPress}
                  />
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

/** One practitioner's vertical strip of bookings + overlays. */
function DayColumn({
  column,
  gridStartMin,
  startHour,
  onBlockPress,
  onEmptyPress,
  onBlockLongPress,
}: {
  column: AllCalendarColumn;
  gridStartMin: number;
  startHour: number;
  onBlockPress: (bookingId: string) => void;
  onEmptyPress: (practitionerId: string, time: string) => void;
  onBlockLongPress?: (bookingId: string, fromPractitionerId: string) => void;
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

  return (
    <View style={[styles.column, { borderColor: colors.border }]}>
      {/* Empty-slot tap layer (blocks/overlays render above). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel={`Tap an empty slot to add a booking for ${column.calendarName}`}
        onPress={(event) => {
          const y = event.nativeEvent.locationY;
          const minutes = startHour * 60 + y / PX_PER_MINUTE;
          const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
          onEmptyPress(column.calendarId, minutesToTime(Math.max(0, snapped)));
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

      {/* Appointment blocks: tap → detail. When reassignment is enabled, an
          OUTER Pressable owns BOTH tap and long-press, and the inner card is
          made non-interactive (pointerEvents="none") so it can't capture the
          responder and swallow the long-press — the reliable nested-Pressable
          pattern. Worklet-free; there's no drag/resize on this grid. The
          read-only grid has no on-card tray, so disabling inner interactivity
          loses nothing. */}
      {positioned.map((item) => {
        const widthPct = 100 / item.laneCount;
        const wrapStyle = [
          styles.blockWrap,
          {
            top: item.top,
            height: item.height,
            left: `${item.laneIndex * widthPct}%` as const,
            width: `${widthPct}%` as const,
          },
        ];
        const block = (noInnerPress: boolean) => (
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
            // The outer Pressable handles tap when long-press is enabled; the
            // inner onPress is then unreachable (parent is the responder).
            onPress={noInnerPress ? noop : onBlockPress}
          />
        );
        return onBlockLongPress ? (
          <Pressable
            key={item.booking.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.timeLabel}, ${item.booking.guestName}`}
            accessibilityHint="Tap to open. Touch and hold to move to another practitioner."
            onPress={() => onBlockPress(item.booking.id)}
            onLongPress={() => onBlockLongPress(item.booking.id, column.calendarId)}
            delayLongPress={350}
            style={wrapStyle}>
            {/* Non-interactive so the outer Pressable owns tap + long-press. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {block(true)}
            </View>
          </Pressable>
        ) : (
          <View key={item.booking.id} style={wrapStyle}>
            {block(false)}
          </View>
        );
      })}
    </View>
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
