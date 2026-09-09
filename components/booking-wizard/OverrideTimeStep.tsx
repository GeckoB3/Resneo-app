import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { AVAILABILITY_OVERRIDE_DATE_TIME_NOTE } from '@/lib/booking/availability-override';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { spacing } from '@/theme/index';

/**
 * The time step with the override on (web #187): a typed time in five-minute
 * steps instead of the slot list, no "Start now" (the override covers it: pick
 * now). Continue runs the dry run so the review step can say what the time
 * overrides.
 */
export function OverrideTimeStep({
  date,
  minutes,
  onChangeMinutes,
  onContinue,
  checking,
  errorMessage,
}: {
  date: string;
  /** Minutes since midnight. */
  minutes: number;
  onChangeMinutes: (next: number) => void;
  onContinue: () => void;
  checking: boolean;
  errorMessage?: string | null;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Text variant="heading">What time?</Text>
        <Text variant="bodyMedium" tone="muted">
          {formatDayHeading(date)}
        </Text>
        <Text variant="caption" tone="muted">
          {AVAILABILITY_OVERRIDE_DATE_TIME_NOTE}
        </Text>
        <View style={styles.pickerRow}>
          <Text variant="label" tone="secondary">
            Start
          </Text>
          <TimePickerField
            value={minutes}
            onChange={onChangeMinutes}
            accessibilityLabel="Start time for the booking"
          />
        </View>
        {errorMessage ? (
          <Text variant="bodySmall" tone="danger">
            {errorMessage}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button label="Continue" fullWidth loading={checking} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actions: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
});
