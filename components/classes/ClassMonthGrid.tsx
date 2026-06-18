import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { addMonthsToDateStr, formatMonthLabel } from '@/lib/dates/venue-dates';
import { hapticSelect } from '@/lib/haptics';
import { type ClassSession } from '@/lib/queries/useClassSchedule';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Cell = { iso: string; day: number; inMonth: boolean };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 6×7 Monday-aligned grid of cells for the month containing `anchor`. */
function buildMonthCells(anchor: string): Cell[] {
  const [year, month] = anchor.split('-').map(Number);
  const first = new Date(year!, month! - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-aligned (JS getDay: Sun=0)
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year!, month! - 1, 1 - offset + i);
    cells.push({
      iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      day: date.getDate(),
      inMonth: date.getMonth() === month! - 1,
    });
  }
  return cells;
}

type ClassMonthGridProps = {
  /** Any date inside the displayed month (YYYY-MM-DD). */
  monthAnchor: string;
  onChangeMonth: (nextAnchor: string) => void;
  today: string;
  /** Sessions for the displayed month (already class-type filtered upstream). */
  sessions: ClassSession[];
  /** The currently-selected day, or null = whole month. */
  selectedDate: string | null;
  onSelectDate: (isoDate: string | null) => void;
  isLoading?: boolean;
};

/**
 * Read-only month calendar of class sessions — days with sessions show a count
 * dot, and tapping a day filters the agenda below to that date (tap again to
 * clear). Mirrors the web `ClassTimetableReadOnlyCalendar`; built on the same
 * Monday-aligned month-cell grid the booking wizard's `MonthDatePicker` uses.
 */
export function ClassMonthGrid({
  monthAnchor,
  onChangeMonth,
  today,
  sessions,
  selectedDate,
  onSelectDate,
  isLoading = false,
}: ClassMonthGridProps) {
  const { colors } = useTheme();
  const cells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor]);

  // date → session count, for the per-day dot.
  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) map.set(s.date, (map.get(s.date) ?? 0) + 1);
    return map;
  }, [sessions]);

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          accessibilityLabel="Previous month"
          tint={colors.brand}
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, -1))}
        />
        <Text variant="subheading">{formatMonthLabel(monthAnchor)}</Text>
        <IconButton
          icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          accessibilityLabel="Next month"
          tint={colors.brand}
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, 1))}
        />
      </View>

      <View style={styles.weekHeader}>
        {WEEKDAYS.map((label, index) => (
          <Text key={index} variant="caption" tone="muted" style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const count = countByDate.get(cell.iso) ?? 0;
          const hasSessions = count > 0 && cell.inMonth;
          const isSelected = cell.iso === selectedDate;
          const isToday = cell.iso === today;
          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityLabel={`${cell.iso}${hasSessions ? `, ${count} session${count === 1 ? '' : 's'}` : ''}`}
              accessibilityState={{ selected: isSelected, disabled: !hasSessions }}
              disabled={!hasSessions}
              onPress={() => {
                hapticSelect();
                onSelectDate(isSelected ? null : cell.iso);
              }}
              style={styles.cellWrap}>
              <View
                style={[
                  styles.cell,
                  isSelected ? { backgroundColor: colors.brand } : null,
                  isToday && !isSelected ? { borderColor: colors.brand, borderWidth: 1 } : null,
                ]}>
                <Text
                  variant="bodyMedium"
                  color={
                    isSelected
                      ? colors.onBrand
                      : cell.inMonth
                        ? colors.text
                        : colors.textMuted
                  }
                  style={!cell.inMonth ? styles.outsideMonth : undefined}>
                  {cell.day}
                </Text>
                {hasSessions ? (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: isSelected ? colors.onBrand : colors.brand },
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" tone="muted" style={styles.hint}>
        {isLoading
          ? 'Loading sessions…'
          : selectedDate
            ? 'Showing one day. Tap it again to see the whole month.'
            : 'Days with a dot have sessions. Tap a day to filter the list below.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1.05,
    padding: 2,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  outsideMonth: {
    opacity: 0.35,
  },
  hint: {
    textAlign: 'center',
  },
});
