import { addDays, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type MonthGridProps = {
  /** Any date within the month to display (YYYY-MM-DD). */
  anchor: string;
  today: string;
  /** date → booking count for the day badge. */
  counts: Record<string, number>;
  onSelectDay: (date: string) => void;
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Month overview — 6×7 grid with per-day booking counts; tap a day to drill in. */
export function MonthGrid({ anchor, today, counts, onSelectDay }: MonthGridProps) {
  const { colors } = useTheme();
  const monthDate = parseISO(`${anchor}T12:00:00.000Z`);
  const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text variant="caption" tone="muted">
              {label}
            </Text>
          </View>
        ))}
      </View>

      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={styles.weekRow}>
          {cells.slice(week * 7, week * 7 + 7).map((cell) => {
            const dateStr = format(cell, 'yyyy-MM-dd');
            const inMonth = isSameMonth(cell, monthDate);
            const isToday = dateStr === today;
            const count = counts[dateStr] ?? 0;

            return (
              <Pressable
                key={dateStr}
                onPress={() => onSelectDay(dateStr)}
                accessibilityRole="button"
                accessibilityLabel={`${format(cell, 'd MMMM')}, ${count} bookings`}
                style={[
                  styles.dayCell,
                  { borderColor: colors.border },
                  isToday ? { backgroundColor: colors.brandSubtle } : null,
                ]}>
                <Text
                  variant="bodySmall"
                  color={inMonth ? (isToday ? colors.brand : colors.text) : colors.textMuted}>
                  {format(cell, 'd')}
                </Text>
                {count > 0 ? (
                  <View style={[styles.countPill, { backgroundColor: colors.brand }]}>
                    <Text variant="caption" color={colors.onBrand}>
                      {count}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.countSpacer} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.base,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.xs,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  countPill: {
    minWidth: 18,
    height: 16,
    borderRadius: radius.full,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countSpacer: {
    height: 16,
  },
});
