/**
 * WeekMatrixGrid
 *
 * Whole-team week overview: practitioner ROWS × 7 day COLUMNS, mirroring the
 * web's week matrix (`PractitionerCalendarView` week mode). Each cell shows that
 * practitioner's booking load for that day as a compact count chip with an
 * intensity tint, so a manager sees the entire team's week at a glance — the
 * piece the single-practitioner {@link WeekGrid} can't show.
 *
 * Read-only (web parity): tap a day-COLUMN header to open that day's full Day
 * view; tap a CELL to open that day too (the cell carries no per-booking detail
 * at this density). Horizontal week paging is owned by the parent's swipe
 * gesture, exactly like WeekGrid.
 */

import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hexToRgba } from '@/lib/color';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { CalendarGridResponse } from '@/types/calendar-grid';

/** One row's display label + id. */
export type WeekMatrixCalendar = { id: string; name: string };

/** A day column header. */
export type WeekMatrixDay = {
  /** YYYY-MM-DD */
  date: string;
  /** Short weekday, e.g. "Mon". */
  weekdayLabel: string;
  /** Day-of-month, e.g. "16". */
  dayNumber: string;
  isToday: boolean;
  isWeekend: boolean;
};

type WeekMatrixGridProps = {
  /** Practitioner rows (already ordered + filtered to active). */
  calendars: WeekMatrixCalendar[];
  /** Seven day columns, Monday→Sunday. */
  days: WeekMatrixDay[];
  /** Raw calendar-grid payload — bookings are counted per calendar+date here. */
  grid: CalendarGridResponse | undefined;
  /** Tap a day-column header → open that day in the Day view. */
  onDayPress: (date: string) => void;
  /** Tap a cell → open that day in the Day view (optionally scoped to the row). */
  onCellPress: (calendarId: string, date: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

const ROW_LABEL_WIDTH = 96;
const CELL_MIN_WIDTH = 40;

/**
 * Count bookings per `${calendarId}|${date}` from the grid payload, excluding
 * No-Show (web parity with the month counts). Cancelled is already absent from
 * the grid feed.
 */
function buildCountMap(grid: CalendarGridResponse | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const cal of grid?.calendars ?? []) {
    for (const d of cal.dates) {
      const n = d.bookings.filter((b) => b.status !== 'No-Show').length;
      if (n > 0) map.set(`${cal.calendarId}|${d.date}`, n);
    }
  }
  return map;
}

export function WeekMatrixGrid({
  calendars,
  days,
  grid,
  onDayPress,
  onCellPress,
  refreshing = false,
  onRefresh,
}: WeekMatrixGridProps) {
  const { colors } = useTheme();

  const counts = useMemo(() => buildCountMap(grid), [grid]);
  // Busiest single cell → intensity denominator so the heat tint is comparable
  // across the visible week.
  const maxCount = useMemo(() => {
    let m = 0;
    for (const n of counts.values()) m = Math.max(m, n);
    return m;
  }, [counts]);

  return (
    <ScrollView
      style={styles.root}
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
      {/* Header row: empty corner + 7 day headers. */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <View style={styles.rowLabelCell} />
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

      {/* One row per practitioner. */}
      {calendars.map((cal) => (
        <View key={cal.id} style={[styles.bodyRow, { borderBottomColor: colors.border }]}>
          <View style={styles.rowLabelCell}>
            <Text variant="bodySmall" numberOfLines={2} style={styles.rowLabel}>
              {cal.name}
            </Text>
          </View>
          {days.map((d) => {
            const n = counts.get(`${cal.id}|${d.date}`) ?? 0;
            const intensity = maxCount > 0 ? n / maxCount : 0;
            const bg =
              n > 0 ? hexToRgba(colors.brand, 0.1 + intensity * 0.28) : 'transparent';
            return (
              <Pressable
                key={d.date}
                onPress={() => onCellPress(cal.id, d.date)}
                accessibilityRole="button"
                accessibilityLabel={`${cal.name}, ${d.weekdayLabel} ${d.dayNumber}, ${n} ${n === 1 ? 'booking' : 'bookings'}`}
                style={({ pressed }) => [
                  styles.cell,
                  d.isToday ? { backgroundColor: hexToRgba(colors.brand, 0.04) } : null,
                  pressed ? { opacity: 0.55 } : null,
                ]}>
                {n > 0 ? (
                  <View style={[styles.countChip, { backgroundColor: bg }]}>
                    <Text variant="caption" color={intensity > 0.55 ? colors.onBrand : colors.text}>
                      {n}
                    </Text>
                  </View>
                ) : (
                  <Text variant="caption" tone="muted" style={styles.dash}>
                    ·
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing['3xl'] + spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.xs,
  },
  rowLabelCell: {
    width: ROW_LABEL_WIDTH,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  rowLabel: {
    fontFamily: fonts.semibold,
  },
  headerCell: {
    flex: 1,
    minWidth: CELL_MIN_WIDTH,
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
    minHeight: 48,
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    minWidth: CELL_MIN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  countChip: {
    minWidth: 26,
    height: 22,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dash: {
    opacity: 0.4,
  },
});
