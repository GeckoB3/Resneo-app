/**
 * WeekGrid
 *
 * A 7-day week view for ONE calendar/practitioner: a shared time gutter on the
 * left and seven day columns fitted to the screen width, so the whole week's
 * shape is visible at a glance (web-parity week diary, adapted for phone width).
 *
 * Read-only like the multi-calendar day view — tapping a booking opens its
 * detail, tapping a day header jumps to that day's full Day view (where the
 * on-block quick actions and hold-drag editing live), and tapping an empty slot
 * starts a booking on that day. Keeping the dense week overview gesture-free
 * keeps it fast and legible.
 */

import { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  computeGridBounds,
  computeLaneLayouts,
  hourLabel,
  minutesToTime,
  PX_PER_MINUTE,
  TAP_SNAP_MINUTES,
  timeToMinutes,
  type LaneInput,
} from '@/components/calendar/grid-layout';
import { Text } from '@/components/ui/Text';
import { bookingCalendarBlockPalette } from '@/lib/booking/booking-status-visual';
import { venueClosedRanges, type VenueDayHours } from '@/lib/calendar/venue-closures';
import { hexToRgba } from '@/lib/color';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  CalendarGridBooking,
  CalendarGridSession,
  CalendarGridWorkingHours,
} from '@/types/calendar-grid';
import type { CalendarScheduleBlock } from '@/types/schedule-blocks';

const GUTTER_WIDTH = 38;
const HEADER_HEIGHT = 46;
/** Gap below the sticky header so the first hour label/line isn't tucked under it. */
const GRID_TOP_PAD = 8;
const SESSION_ACCENT = '#6366F1';
const DEFAULT_DURATION_MINUTES = 30;
/** Week bars have no buttons, so they can be much shorter than day bars —
 *  a small floor keeps a tiny booking tappable without inflating the week. */
const WEEK_MIN_BLOCK_HEIGHT = 18;

/** One day's data for a single calendar, plus its display labels. */
export type WeekDayColumn = {
  /** YYYY-MM-DD */
  date: string;
  /** Short weekday, e.g. "Mon". */
  weekdayLabel: string;
  /** Day-of-month, e.g. "16". */
  dayNumber: string;
  isToday: boolean;
  isWeekend: boolean;
  workingHours: CalendarGridWorkingHours[];
  bookings: CalendarGridBooking[];
  sessions: CalendarGridSession[];
  /** Class/event/resource blocks (schedule feed) for this day's calendar. */
  scheduleBlocks: CalendarScheduleBlock[];
  /** Venue open/closed state for this day → "Closed" shading. */
  venueHours: VenueDayHours;
};

type WeekGridProps = {
  /** Seven days, Monday→Sunday, for the selected calendar. */
  days: WeekDayColumn[];
  /** Minutes-since-midnight for the now-line, or null when today isn't in view. */
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  /** Empty-slot tap — carries the column's date and the snapped time. */
  onEmptyPress: (date: string, time: string) => void;
  /** Tap a day header to open that day in the Day view. */
  onDayPress: (date: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

type PositionedBooking = {
  booking: CalendarGridBooking;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
};

/** Lay out one day's bookings into lanes on TRUE minute ranges (web lane model). */
function positionBookings(
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
      height: Math.max((end - start) * PX_PER_MINUTE, WEEK_MIN_BLOCK_HEIGHT),
      laneIndex: lane.laneIndex,
      laneCount: lane.laneCount,
    };
  });
}

export function WeekGrid({
  days,
  nowMinutes,
  onBlockPress,
  onEmptyPress,
  onDayPress,
  refreshing = false,
  onRefresh,
}: WeekGridProps) {
  const { colors } = useTheme();

  // The sticky header (stickyHeaderIndices) does NOT inherit the ScrollView's
  // width, so its flex-1 day cells collapse into a thin vertical column. Measure
  // the grid width and pin the header + body rows to it so the seven columns
  // spread across the screen (windowWidth is the pre-measure fallback).
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const contentWidth = measuredWidth || windowWidth;

  // One shared time scale across all seven columns so the gutter, hour lines
  // and now-line line up across the week.
  const { startHour, endHour, totalHeight, gridStartMin } = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    for (const day of days) {
      for (const wh of day.workingHours) {
        ranges.push({ start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) });
      }
      for (const b of day.bookings) {
        const start = timeToMinutes(b.startTime);
        const end = b.endTime ? timeToMinutes(b.endTime) : start + DEFAULT_DURATION_MINUTES;
        ranges.push({ start, end: Math.max(end, start + DEFAULT_DURATION_MINUTES) });
      }
      for (const s of day.sessions) {
        ranges.push({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) });
      }
      for (const sb of day.scheduleBlocks) {
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
  }, [days]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  return (
    <ScrollView
      style={styles.scroll}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        setMeasuredWidth((prev) => (prev === w ? prev : w));
      }}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
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
      {/* Sticky day headers — always show which column is which day. */}
      <View
        style={[
          styles.headerRow,
          { width: contentWidth, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}>
        <View style={styles.headerGutter} />
        {days.map((d) => (
          <Pressable
            key={d.date}
            onPress={() => onDayPress(d.date)}
            accessibilityRole="button"
            accessibilityLabel={`${d.weekdayLabel} ${d.dayNumber}${d.isToday ? ', today' : ''}, open day view`}
            style={({ pressed }) => [styles.headerCell, { opacity: pressed ? 0.6 : 1 }]}>
            <Text variant="caption" color={d.isToday ? colors.brand : colors.textMuted}>
              {d.weekdayLabel}
            </Text>
            <View style={[styles.dayNumCircle, d.isToday ? { backgroundColor: colors.brand } : null]}>
              <Text
                variant="bodySmall"
                color={d.isToday ? colors.onBrand : d.isWeekend ? colors.textMuted : colors.text}>
                {d.dayNumber}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={[styles.bodyRow, { width: contentWidth }]}>
        {/* Time gutter */}
        <View style={[styles.gutter, { height: totalHeight }]}>
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

        {/* Columns band with shared hour lines */}
        <View style={[styles.columnsArea, { height: totalHeight }]}>
          {/* Subtle alternating hour bands (matches the day grid) for legibility. */}
          {hours.slice(0, -1).map((hour, i) =>
            i % 2 === 1 ? (
              <View
                key={`band-${hour}`}
                pointerEvents="none"
                style={[
                  styles.hourBand,
                  { top: (hour - startHour) * 60 * PX_PER_MINUTE, backgroundColor: colors.text },
                ]}
              />
            ) : null,
          )}
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
          <View style={styles.columnsRow}>
            {days.map((d) => (
              <WeekDayCol
                key={d.date}
                day={d}
                gridStartMin={gridStartMin}
                startHour={startHour}
                endHour={endHour}
                nowMinutes={nowMinutes}
                onBlockPress={onBlockPress}
                onEmptyPress={onEmptyPress}
              />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/** One day's column — bookings, sessions, and the now-line on today. */
function WeekDayCol({
  day,
  gridStartMin,
  startHour,
  endHour,
  nowMinutes,
  onBlockPress,
  onEmptyPress,
}: {
  day: WeekDayColumn;
  gridStartMin: number;
  startHour: number;
  endHour: number;
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  onEmptyPress: (date: string, time: string) => void;
}) {
  const { colors } = useTheme();

  const positioned = useMemo(
    () => positionBookings(day.bookings, gridStartMin),
    [day.bookings, gridStartMin],
  );

  const sessions = useMemo(
    () =>
      day.sessions
        .map((session) => {
          const start = timeToMinutes(session.startTime);
          const end = timeToMinutes(session.endTime);
          return {
            session,
            top: (start - gridStartMin) * PX_PER_MINUTE,
            height: Math.max((end - start) * PX_PER_MINUTE, WEEK_MIN_BLOCK_HEIGHT),
          };
        })
        .filter((s) => s.height > 0),
    [day.sessions, gridStartMin],
  );

  const scheduleBlocks = useMemo(
    () =>
      day.scheduleBlocks
        .map((block) => {
          const start = timeToMinutes(block.startTime);
          const end = timeToMinutes(block.endTime);
          return {
            block,
            top: (start - gridStartMin) * PX_PER_MINUTE,
            height: Math.max((end - start) * PX_PER_MINUTE, WEEK_MIN_BLOCK_HEIGHT),
          };
        })
        .filter((s) => s.height > 0),
    [day.scheduleBlocks, gridStartMin],
  );

  const closedRanges = useMemo(
    () => venueClosedRanges(day.venueHours, startHour * 60, endHour * 60),
    [day.venueHours, startHour, endHour],
  );

  // Clamp to the visible window so an out-of-hours "now" doesn't draw a stray
  // dot/bar above or below the grid (the column has no overflow clip).
  const nowTop =
    day.isToday && nowMinutes != null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60
      ? (nowMinutes - startHour * 60) * PX_PER_MINUTE
      : null;

  return (
    <View
      style={[
        styles.column,
        {
          borderColor: colors.border,
          backgroundColor: day.isToday ? hexToRgba(colors.brand, 0.05) : 'transparent',
        },
      ]}>
      {/* Empty-slot tap layer (blocks render above). */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel={`Tap to add a booking on ${day.weekdayLabel} ${day.dayNumber}`}
        onPress={(event) => {
          const y = event.nativeEvent.locationY;
          const minutes = startHour * 60 + y / PX_PER_MINUTE;
          const snapped = Math.round(minutes / TAP_SNAP_MINUTES) * TAP_SNAP_MINUTES;
          onEmptyPress(day.date, minutesToTime(Math.max(0, snapped)));
        }}
      />

      {/* Venue-closed shading (out-of-hours / closed day) — faint band, behind
          bookings; the column is too narrow for a label. */}
      {closedRanges.map((r) => (
        <View
          key={`closed-${r.start}-${r.end}`}
          pointerEvents="none"
          style={[
            styles.closedBand,
            {
              top: (r.start - startHour * 60) * PX_PER_MINUTE,
              height: (r.end - r.start) * PX_PER_MINUTE,
              backgroundColor: hexToRgba(colors.text, 0.06),
            },
          ]}
        />
      ))}

      {/* Class / event capacity blocks (indigo). */}
      {sessions.map(({ session, top, height }) => (
        <View
          key={session.id}
          pointerEvents="none"
          style={[
            styles.session,
            { top, height, backgroundColor: `${SESSION_ACCENT}22`, borderColor: SESSION_ACCENT },
          ]}>
          {height >= WEEK_MIN_BLOCK_HEIGHT ? (
            <Text variant="caption" numberOfLines={1} style={{ color: SESSION_ACCENT }}>
              {session.bookedCount}/{session.capacity}
            </Text>
          ) : null}
        </View>
      ))}

      {/* Class / event / resource blocks from the schedule feed — read-only,
          named, accent-coloured. Disjoint from `sessions` (different feed). */}
      {scheduleBlocks.map(({ block, top, height }) => (
        <View
          key={block.id}
          pointerEvents="none"
          accessibilityLabel={block.title}
          style={[
            styles.session,
            { top, height, backgroundColor: hexToRgba(block.accent, 0.13), borderColor: block.accent },
          ]}>
          {height >= WEEK_MIN_BLOCK_HEIGHT ? (
            <Text variant="caption" numberOfLines={1} style={[styles.scheduleName, { color: block.accent }]}>
              {block.title}
            </Text>
          ) : null}
        </View>
      ))}

      {/* Bookings. */}
      {positioned.map((item) => {
        const widthPct = 100 / item.laneCount;
        return (
          <Pressable
            key={item.booking.id}
            onPress={() => onBlockPress(item.booking.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.booking.startTime} ${item.booking.guestName}, ${item.booking.status}`}
            hitSlop={item.height < 28 ? 4 : undefined}
            style={[
              styles.blockWrap,
              {
                top: item.top,
                height: item.height,
                left: `${item.laneIndex * widthPct}%`,
                width: `${widthPct}%`,
              },
            ]}>
            <WeekBlock booking={item.booking} height={item.height} />
          </Pressable>
        );
      })}

      {/* Now-line — only on today's column, only when "now" is within the window. */}
      {nowTop != null ? (
        <View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}>
          <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
          <View style={[styles.nowBar, { backgroundColor: colors.danger }]} />
        </View>
      ) : null}
    </View>
  );
}

/** Compact, read-only booking block for the dense week column. */
function WeekBlock({ booking, height }: { booking: CalendarGridBooking; height: number }) {
  const palette = bookingCalendarBlockPalette({
    status: booking.status,
    client_arrived_at: booking.client_arrived_at,
    staff_attendance_confirmed_at: booking.staff_attendance_confirmed_at,
    guest_attendance_confirmed_at: booking.guest_attendance_confirmed_at,
  });
  return (
    <View style={[styles.block, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={[styles.blockAccent, { backgroundColor: palette.accent }]} />
      {/* Always label the bar (down to the 18px floor) so short bookings aren't blank. */}
      {height >= WEEK_MIN_BLOCK_HEIGHT ? (
        <View style={styles.blockBody}>
          <Text numberOfLines={1} style={[styles.blockName, { color: palette.text }]}>
            {booking.guestName}
          </Text>
          {height >= 40 ? (
            <Text numberOfLines={1} style={[styles.blockTime, { color: hexToRgba(palette.text, 0.8) }]}>
              {booking.startTime.slice(0, 5)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Fill the parent so the flex-1 day columns have a definite width to split
  // across — without this the vertical ScrollView sizes to content width and
  // the seven columns collapse into a thin strip beside the gutter.
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerGutter: {
    width: GUTTER_WIDTH,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: spacing.xs,
  },
  dayNumCircle: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyRow: {
    flexDirection: 'row',
    marginTop: GRID_TOP_PAD,
  },
  gutter: {
    width: GUTTER_WIDTH,
  },
  gutterLabel: {
    position: 'absolute',
    right: 4,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontSize: 10,
  },
  columnsArea: {
    flex: 1,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  hourBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 60 * PX_PER_MINUTE,
    opacity: 0.03,
  },
  columnsRow: {
    flexDirection: 'row',
    flex: 1,
  },
  column: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  closedBand: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  session: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 3,
    borderLeftWidth: 2,
    overflow: 'hidden',
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  scheduleName: {
    fontSize: 9,
    lineHeight: 12,
  },
  blockWrap: {
    position: 'absolute',
    paddingHorizontal: 1,
  },
  block: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  blockAccent: {
    width: 3,
  },
  blockBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  blockName: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 13,
  },
  blockTime: {
    fontFamily: fonts.regular,
    fontSize: 9,
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  nowDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  nowBar: {
    flex: 1,
    height: 1.5,
  },
});
