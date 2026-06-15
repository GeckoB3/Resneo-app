import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { minutesToTime } from '@/components/calendar/grid-layout';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type TimePickerFieldProps = {
  /** Minutes since midnight (0–1439). */
  value: number;
  /** Called with the new minutes-since-midnight on change. */
  onChange: (minutes: number) => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

/** Minutes-since-midnight → a Date carrying just that time (date part is arbitrary). */
function minutesToDate(minutes: number): Date {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return new Date(2000, 0, 1, Math.floor(safe / 60), safe % 60, 0, 0);
}

function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * A tappable time value backed by the OS-native time picker — the mobile
 * analogue of the web's `<input type="time">` (any-minute precision, no 15-min
 * stepping). iOS renders the compact inline picker; Android shows the value and
 * opens the native time dialog on tap.
 */
export function TimePickerField({ value, onChange, accessibilityLabel, disabled }: TimePickerFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  // iOS: the compact picker IS the tappable field (matches web's time input).
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={minutesToDate(value)}
        mode="time"
        display="compact"
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        onChange={(_event: DateTimePickerEvent, date?: Date) => {
          if (date) onChange(dateToMinutes(date));
        }}
      />
    );
  }

  // Android: tap the value to open the native time dialog.
  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.androidField,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          },
        ]}>
        <Text variant="subheading" style={styles.value}>
          {minutesToTime(value)}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={minutesToDate(value)}
          mode="time"
          is24Hour
          display="default"
          onChange={(event: DateTimePickerEvent, date?: Date) => {
            setOpen(false);
            if (event.type === 'set' && date) onChange(dateToMinutes(date));
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  androidField: {
    minWidth: 88,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
});
