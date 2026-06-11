/**
 * Multi-practitioner side-by-side day grid.
 *
 * Renders one CalendarDayGrid column per visible practitioner, sharing a
 * single time-gutter on the left. All columns scroll together via a shared
 * ScrollView ref that lives here and is forwarded to each column.
 *
 * Architecture:
 * - Outer: horizontal ScrollView (pan-x) wrapping [gutter | col | col | …]
 * - Inner: single vertical ScrollView shared by all columns (ref forwarded)
 */
import { useMemo, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollView as ScrollViewType,
} from 'react-native';

import { CalendarDayGrid, type CalendarTimeBlock } from '@/components/calendar/CalendarDayGrid';
import {
  computeGridBounds,
  hourLabel,
  PX_PER_MINUTE,
  TIME_GUTTER_WIDTH,
  timeToMinutes,
} from '@/components/calendar/grid-layout';
import { Text } from '@/components/ui/Text';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CalendarGridBooking, CalendarGridWorkingHours } from '@/types/calendar-grid';

/** Width of each practitioner column (in dp). */
export const COLUMN_WIDTH = 200;

export type ColumnData = {
  calendarId: string;
  calendarName: string;
  bookings: CalendarGridBooking[];
  workingHours: CalendarGridWorkingHours[];
  timeBlocks: CalendarTimeBlock[];
};

type MultiColumnDayGridProps = {
  columns: ColumnData[];
  nowMinutes: number | null;
  onBlockPress: (bookingId: string) => void;
  onBlockLongPress?: (bookingId: string) => void;
  onStatusChange?: (bookingId: string, status: string) => void;
  onArrivalToggle?: (bookingId: string, arrived: boolean) => void;
  pendingActionIds?: Set<string>;
  complianceFlags?: Record<string, ComplianceBookingFlag>;
  onEmptyPress: (calendarId: string, time: string) => void;
  onBlockTimeBlockPress?: (blockId: string) => void;
  /** Called when the user completes a drag-to-reschedule on a block. */
  onDragReschedule?: (bookingId: string, newTime: string) => void;
  /** Called when the user drags the resize handle to change duration. */
  onDragResize?: (bookingId: string, newDurationMinutes: number) => void;
};

/**
 * Horizontally-scrollable multi-practitioner day grid. All columns share the
 * same vertical ScrollView so they scroll in lock-step.
 */
export function MultiColumnDayGrid({
  columns,
  nowMinutes,
  onBlockPress,
  onBlockLongPress,
  onStatusChange,
  onArrivalToggle,
  pendingActionIds,
  complianceFlags,
  onEmptyPress,
  onBlockTimeBlockPress,
  onDragReschedule,
  onDragResize,
}: MultiColumnDayGridProps) {
  const { colors } = useTheme();

  // All columns share this single vertical scroll ref.
  const sharedScrollRef = useRef<ScrollViewType | null>(null);

  // Compute shared grid bounds so every column has the same vertical extent.
  const sharedBoundsRanges = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    for (const col of columns) {
      for (const wh of col.workingHours) {
        ranges.push({ start: timeToMinutes(wh.start), end: timeToMinutes(wh.end) });
      }
      for (const b of col.bookings) {
        const start = timeToMinutes(b.startTime);
        const end = b.endTime ? timeToMinutes(b.endTime) : start + 30;
        ranges.push({ start, end: Math.max(end, start + 30) });
      }
    }
    return ranges;
  }, [columns]);

  const bounds = useMemo(
    () => computeGridBounds(sharedBoundsRanges),
    [sharedBoundsRanges],
  );

  const hours = useMemo(
    () =>
      Array.from({ length: bounds.endHour - bounds.startHour + 1 }, (_, i) => bounds.startHour + i),
    [bounds],
  );

  const totalHeight = (bounds.endHour - bounds.startHour) * 60 * PX_PER_MINUTE;

  return (
    <View style={styles.root}>
      {/* Outer horizontal scroll for column panning */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
        {/* Fixed time gutter — scrolls vertically with the shared ScrollView */}
        <View style={[styles.gutterWrap, { borderRightColor: colors.border }]}>
          <ScrollView
            ref={sharedScrollRef}
            contentContainerStyle={styles.gutterContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
            // The gutter scroll is driven by the first column's ScrollView.
            // We disable direct scroll here; the first column's onScroll
            // syncs via scrollTo calls (see note below).
          >
            <View style={{ height: totalHeight }}>
              {hours.map((hour) => {
                const top = (hour - bounds.startHour) * 60 * PX_PER_MINUTE;
                return (
                  <View
                    key={hour}
                    style={[styles.hourRow, { top }, { pointerEvents: 'none' }]}>
                    <Text variant="caption" tone="muted" style={styles.hourLabel}>
                      {hourLabel(hour)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Practitioner columns */}
        {columns.map((col) => (
          <View
            key={col.calendarId}
            style={[
              styles.columnWrap,
              { borderRightColor: colors.border },
            ]}>
            {/* Column header */}
            <View
              style={[styles.colHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              <Text
                variant="label"
                numberOfLines={1}
                style={styles.colHeaderText}>
                {col.calendarName}
              </Text>
            </View>
            {/* Column grid */}
            <View style={styles.colGrid}>
              <CalendarDayGrid
                bookings={col.bookings}
                workingHours={col.workingHours}
                timeBlocks={col.timeBlocks}
                nowMinutes={nowMinutes}
                onBlockPress={onBlockPress}
                onBlockLongPress={onBlockLongPress}
                onStatusChange={onStatusChange}
                onArrivalToggle={onArrivalToggle}
                pendingActionIds={pendingActionIds}
                complianceFlags={complianceFlags}
                onEmptyPress={(time) => onEmptyPress(col.calendarId, time)}
                onBlockTimeBlockPress={onBlockTimeBlockPress}
                scrollRef={sharedScrollRef}
                hideGutter
                sharedBoundsRanges={sharedBoundsRanges}
                onDragReschedule={onDragReschedule}
                onDragResize={onDragResize}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hScroll: {
    flex: 1,
  },
  gutterWrap: {
    width: TIME_GUTTER_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  gutterContent: {
    // Extra top padding = scrollContent paddingTop + colHeader height (32)
    paddingTop: spacing.sm + 32,
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
  },
  hourLabel: {
    width: TIME_GUTTER_WIDTH - spacing.xs,
    paddingRight: spacing.sm,
    textAlign: 'right',
    marginTop: -7,
    fontVariant: ['tabular-nums'],
  },
  columnWrap: {
    width: COLUMN_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  colHeader: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colHeaderText: {
    textAlign: 'center',
  },
  colGrid: {
    flex: 1,
  },
});
