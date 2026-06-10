import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useRescheduleBooking } from '@/lib/queries/useBookingMutations';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type RescheduleTarget = {
  id: string;
  guestName: string;
  /** Current date (YYYY-MM-DD) and time (HH:mm[:ss]). */
  date: string;
  time: string;
};

type RescheduleSheetProps = {
  target: RescheduleTarget | null;
  onClose: () => void;
  /** Fired after a successful move with the PREVIOUS slot (for undo). */
  onMoved?: (previous: RescheduleTarget) => void;
};

const STEP_MINUTES = 15;
const MAX_MINUTES = 23 * 60 + 45;

/** Bottom-sheet to move a booking to a new day/time (long-press a calendar block). */
export function RescheduleSheet({ target, onClose, onMoved }: RescheduleSheetProps) {
  const mutation = useRescheduleBooking(target?.id ?? '');

  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);

  // Seed the editable date/time from the target booking when it changes — the
  // React-recommended "adjust state during render" pattern (no effect needed).
  if (target && target.id !== seededId) {
    setSeededId(target.id);
    setDate(target.date);
    setMinutes(timeToMinutes(target.time));
    setError(null);
  } else if (!target && seededId !== null) {
    setSeededId(null);
  }

  const unchanged = target ? date === target.date && minutesToTime(minutes) === target.time.slice(0, 5) : true;

  async function handleConfirm() {
    if (!target) return;
    setError(null);
    try {
      await mutation.mutateAsync({ date, time: `${minutesToTime(minutes)}:00` });
      hapticSuccess();
      onMoved?.(target);
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not reschedule. Try another time.');
    }
  }

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Reschedule
                </Text>
                <Text variant="title">{target.guestName}</Text>
                <Text variant="bodySmall" tone="muted">
                  Now: {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
                </Text>
              </View>

              <Stepper
                label="Date"
                value={formatDayHeading(date)}
                onDecrement={() => setDate((d) => addDaysToDateStr(d, -1))}
                onIncrement={() => setDate((d) => addDaysToDateStr(d, 1))}
              />
              <Stepper
                label="Time"
                value={minutesToTime(minutes)}
                onDecrement={() => setMinutes((m) => Math.max(0, m - STEP_MINUTES))}
                onIncrement={() => setMinutes((m) => Math.min(MAX_MINUTES, m + STEP_MINUTES))}
              />

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <View style={styles.actions}>
                <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.actionButton} />
                <Button
                  label="Confirm move"
                  onPress={() => void handleConfirm()}
                  loading={mutation.isPending}
                  disabled={unchanged}
                  style={styles.actionButton}
                />
              </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View style={styles.stepperControl}>
        <StepButton symbol="−" onPress={onDecrement} />
        <Text variant="subheading" style={styles.stepperValue}>
          {value}
        </Text>
        <StepButton symbol="+" onPress={onIncrement} />
      </View>
    </View>
  );
}

function StepButton({ symbol, onPress }: { symbol: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={symbol === '+' ? 'Increase' : 'Decrease'}
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.stepSymbol, { color: colors.brand }]}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  stepperValue: {
    minWidth: 140,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 26,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
});
