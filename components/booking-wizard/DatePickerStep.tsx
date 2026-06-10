import { addDays, format } from 'date-fns';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type DateOption = {
  isoDate: string;
  weekdayLabel: string;
  dayLabel: string;
  monthLabel: string;
};

/** Returns the next `count` calendar days starting from today in the venue timezone. */
export function buildUpcomingDays(
  timeZone: string,
  count = 28,
  from: Date = new Date(),
): DateOption[] {
  const todayIso = calendarDateInTimeZone(from, timeZone);
  const [year, month, day] = todayIso.split('-').map(Number);
  const anchor = new Date(year!, month! - 1, day!);

  return Array.from({ length: count }, (_, index) => {
    const date = addDays(anchor, index);
    const isoDate = calendarDateInTimeZone(date, timeZone);
    return {
      isoDate,
      weekdayLabel: format(date, 'EEE'),
      dayLabel: format(date, 'd'),
      monthLabel: format(date, 'MMM'),
    };
  });
}

type DatePickerStepProps = {
  timeZone: string;
  selectedDate: string | null;
  onSelectDate: (isoDate: string) => void;
  onContinue: () => void;
};

/** Step 2 — horizontal picker for the next seven days. */
export function DatePickerStep({
  timeZone,
  selectedDate,
  onSelectDate,
  onContinue,
}: DatePickerStepProps) {
  const { colors } = useTheme();
  const dates = useMemo(() => buildUpcomingDays(timeZone), [timeZone]);

  return (
    <View style={styles.container}>
      <Text variant="heading">Choose a date</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {dates.map((option) => {
          const isSelected = option.isoDate === selectedDate;
          return (
            <Pressable
              key={option.isoDate}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectDate(option.isoDate)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: isSelected ? colors.brand : colors.surface,
                  borderColor: isSelected ? colors.brand : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <Text variant="caption" color={isSelected ? colors.onBrand : colors.textSecondary}>
                {option.weekdayLabel}
              </Text>
              <Text variant="title" color={isSelected ? colors.onBrand : colors.text}>
                {option.dayLabel}
              </Text>
              <Text variant="caption" color={isSelected ? colors.onBrand : colors.textMuted}>
                {option.monthLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button label="Continue" fullWidth onPress={onContinue} disabled={!selectedDate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  strip: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  card: {
    minWidth: 72,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.base,
    gap: spacing.xs,
  },
});
