import { format, parseISO } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type WeekStripProps = {
  /** Seven YYYY-MM-DD dates, Monday→Sunday. */
  days: string[];
  selectedDate: string;
  today: string;
  /** date → booking count for the day badge. */
  counts: Record<string, number>;
  onSelectDay: (date: string) => void;
};

function parse(dateStr: string): Date {
  return parseISO(`${dateStr}T12:00:00.000Z`);
}

/** Horizontal 7-day selector with per-day booking counts. */
export function WeekStrip({ days, selectedDate, today, counts, onSelectDay }: WeekStripProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {days.map((date) => {
        const selected = date === selectedDate;
        const isToday = date === today;
        const count = counts[date] ?? 0;
        const d = parse(date);

        return (
          <Pressable
            key={date}
            onPress={() => onSelectDay(date)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={styles.cell}>
            <Text variant="caption" color={selected ? colors.brand : colors.textMuted}>
              {format(d, 'EEE')}
            </Text>
            <View
              style={[
                styles.dayCircle,
                selected
                  ? { backgroundColor: colors.brand }
                  : isToday
                    ? { borderColor: colors.brand, borderWidth: 1 }
                    : null,
              ]}>
              <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.text}>
                {format(d, 'd')}
              </Text>
            </View>
            {count > 0 ? (
              <Text variant="caption" color={selected ? colors.brand : colors.textMuted}>
                {count}
              </Text>
            ) : (
              <View style={styles.countSpacer} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countSpacer: {
    height: 16,
  },
});
