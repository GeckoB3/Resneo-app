import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { addMonthsToDateStr, formatMonthLabel } from '@/lib/dates/venue-dates';
import { hapticSelect } from '@/lib/haptics';
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
  // Monday-aligned offset (JS getDay: Sun=0).
  const offset = (first.getDay() + 6) % 7;
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

type MonthDatePickerProps = {
  /** Any date inside the displayed month (YYYY-MM-DD). */
  monthAnchor: string;
  onChangeMonth: (nextAnchor: string) => void;
  today: string;
  selectedDate: string | null;
  onSelectDate: (isoDate: string) => void;
  /** Dates with at least one bookable slot; null while loading. */
  availableDates: Set<string> | null;
  isLoading?: boolean;
  onContinue: () => void;
};

/**
 * Month calendar with availability markers — only dates the engine can fit the
 * chosen service/variant/add-ons are selectable (mirrors the web booking flow).
 */
export function MonthDatePicker({
  monthAnchor,
  onChangeMonth,
  today,
  selectedDate,
  onSelectDate,
  availableDates,
  isLoading = false,
  onContinue,
}: MonthDatePickerProps) {
  const { colors } = useTheme();
  const cells = useMemo(() => buildMonthCells(monthAnchor), [monthAnchor]);
  const currentMonth = monthAnchor.slice(0, 7);
  const canGoBack = currentMonth > today.slice(0, 7);

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose a date</Text>

      <View style={styles.monthNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoBack}
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, -1))}
          style={({ pressed }) => [styles.navBtn, { opacity: !canGoBack ? 0.3 : pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ‹
          </Text>
        </Pressable>
        <View style={styles.monthLabel}>
          <Text variant="subheading">{formatMonthLabel(monthAnchor)}</Text>
          {isLoading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => onChangeMonth(addMonthsToDateStr(monthAnchor, 1))}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="title" color={colors.brand}>
            ›
          </Text>
        </Pressable>
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
          const isPast = cell.iso < today;
          const available = availableDates ? availableDates.has(cell.iso) : false;
          const disabled = !cell.inMonth || isPast || (availableDates !== null && !available);
          const isSelected = cell.iso === selectedDate;
          const isToday = cell.iso === today;
          return (
            <Pressable
              key={cell.iso}
              accessibilityRole="button"
              accessibilityLabel={cell.iso}
              accessibilityState={{ disabled, selected: isSelected }}
              disabled={disabled}
              onPress={() => {
                hapticSelect();
                onSelectDate(cell.iso);
              }}
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
                    : disabled
                      ? colors.textMuted
                      : colors.text
                }
                style={!cell.inMonth ? styles.outsideMonth : undefined}>
                {cell.day}
              </Text>
              {available && !isSelected && cell.inMonth && !isPast ? (
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" tone="muted" style={styles.hint}>
        Dates with a dot have open times for this service.
      </Text>

      <Button label="Continue" fullWidth onPress={onContinue} disabled={!selectedDate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    gap: 2,
  },
  outsideMonth: {
    opacity: 0.35,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  hint: {
    textAlign: 'center',
  },
});
