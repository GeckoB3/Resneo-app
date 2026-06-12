import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

type BookingDateRangeSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Current applied range start (YYYY-MM-DD) or null when none chosen yet. */
  from: string | null;
  /** Current applied range end (YYYY-MM-DD) or null when none chosen yet. */
  to: string | null;
  /** Today in the venue timezone (YYYY-MM-DD) — seeds empty inputs. */
  today: string;
  /** Commits the validated range (from ≤ to guaranteed). */
  onApply: (range: { from: string; to: string }) => void;
};

/** Strict YYYY-MM-DD shape + real calendar date (rejects 2026-13-40 etc.). */
function isValidDateStr(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m! < 1 || m! > 12 || d! < 1 || d! > 31) return false;
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m! - 1 &&
    date.getUTCDate() === d
  );
}

type RangeFormProps = {
  initialFrom: string;
  initialTo: string;
  today: string;
  onClose: () => void;
  onApply: (range: { from: string; to: string }) => void;
};

/**
 * Inner form — remounted (via a key on the parent) every time the sheet opens,
 * so the useState initializers re-seed the inputs from the applied range without
 * a setState-in-effect cascade.
 */
function RangeForm({ initialFrom, initialTo, today, onClose, onApply }: RangeFormProps) {
  const [fromText, setFromText] = useState(initialFrom);
  const [toText, setToText] = useState(initialTo);

  const fromValid = isValidDateStr(fromText.trim());
  const toValid = isValidDateStr(toText.trim());
  const ordered = fromValid && toValid && fromText.trim() <= toText.trim();
  const canApply = fromValid && toValid && ordered;

  const fromError = fromText.trim().length > 0 && !fromValid ? 'Use YYYY-MM-DD.' : undefined;
  const toError =
    toText.trim().length > 0 && !toValid
      ? 'Use YYYY-MM-DD.'
      : fromValid && toValid && !ordered
        ? 'End date must be on or after the start date.'
        : undefined;

  return (
    <>
      <Text variant="subheading">Custom date range</Text>
      <Text variant="caption" tone="muted">
        Enter dates as YYYY-MM-DD (e.g. {today}).
      </Text>

      <View style={styles.fields}>
        <Input
          label="From"
          value={fromText}
          onChangeText={setFromText}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={fromError}
          containerStyle={styles.field}
        />
        <Input
          label="To"
          value={toText}
          onChangeText={setToText}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          error={toError}
          containerStyle={styles.field}
        />
      </View>

      <Button
        label="Apply range"
        variant="primary"
        fullWidth
        disabled={!canApply}
        onPress={() => {
          if (canApply) {
            onApply({ from: fromText.trim(), to: toText.trim() });
            onClose();
          }
        }}
      />
      <Button label="Cancel" variant="ghost" fullWidth onPress={onClose} />
    </>
  );
}

/**
 * Custom date-range picker for the appointments list. The app has no native
 * datetimepicker installed, and the wizard's MonthDatePicker blocks past dates
 * (it's built for forward booking) — list filters routinely target past ranges,
 * so this uses validated YYYY-MM-DD inputs with inline errors instead.
 */
export function BookingDateRangeSheet({
  visible,
  onClose,
  from,
  to,
  today,
  onApply,
}: BookingDateRangeSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {/* Key forces a fresh form (re-seeded inputs) each time the sheet opens. */}
      {visible ? (
        <RangeForm
          key={`${from ?? ''}|${to ?? ''}`}
          initialFrom={from ?? today}
          initialTo={to ?? today}
          today={today}
          onClose={onClose}
          onApply={onApply}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fields: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
});
