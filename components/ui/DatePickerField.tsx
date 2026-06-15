import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type DatePickerFieldProps = {
  /** Selected date as "YYYY-MM-DD". */
  value: string;
  /** Called with the new "YYYY-MM-DD" on change. */
  onChange: (isoDate: string) => void;
  accessibilityLabel: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
};

/** "YYYY-MM-DD" → a local noon Date (noon avoids any tz day-boundary slip). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * A tappable date value backed by the OS-native date picker — the mobile
 * analogue of the web's `<input type="date">` (no typed YYYY-MM-DD). iOS renders
 * the compact inline picker; Android shows the formatted value and opens the
 * native date dialog on tap.
 */
export function DatePickerField({
  value,
  onChange,
  accessibilityLabel,
  minimumDate,
  maximumDate,
  disabled,
}: DatePickerFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={isoToDate(value)}
        mode="date"
        display="compact"
        disabled={disabled}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        accessibilityLabel={accessibilityLabel}
        onChange={(_event: DateTimePickerEvent, date?: Date) => {
          if (date) onChange(dateToIso(date));
        }}
      />
    );
  }

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
        <Text variant="bodyMedium" style={styles.value}>
          {format(isoToDate(value), 'd MMM yyyy')}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(event: DateTimePickerEvent, date?: Date) => {
            setOpen(false);
            if (event.type === 'set' && date) onChange(dateToIso(date));
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  androidField: {
    minWidth: 132,
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
