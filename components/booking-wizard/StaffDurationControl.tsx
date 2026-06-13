import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/** Web parity (`STAFF_CUSTOM_DURATION_PRESETS`). */
const PRESETS = [15, 30, 45, 60, 75, 90, 105, 120];
const MIN_MINUTES = 15;
const MAX_MINUTES = 840;
const STEP_MINUTES = 5;

function clamp(minutes: number): number {
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes));
}

type StaffDurationControlProps = {
  /** The service/variant's natural duration — the "default". */
  naturalDuration: number;
  /** Current staff override (minutes), or null for the default. */
  override: number | null;
  /** Set a custom duration, or null to clear back to the default. */
  onChange: (minutes: number | null) => void;
};

/**
 * Staff-only "custom duration" control shown next to a service/variant row — a
 * pill displaying the current duration that opens a sheet of presets plus a
 * fine-tune stepper. Mirrors the web booking flow's `StaffCustomDurationPopover`
 * (presets 15–120, "other minutes", Reset/Done) so a custom duration is chosen
 * at the service step, not the time step.
 *
 * Selecting a value equal to the natural duration clears the override, so the
 * parent's single `durationOverride` stays clean (null = no override).
 */
export function StaffDurationControl({
  naturalDuration,
  override,
  onChange,
}: StaffDurationControlProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const displayed = override ?? naturalDuration;
  const isCustom = override != null && override !== naturalDuration;

  function commit(minutes: number) {
    const next = clamp(minutes);
    onChange(next === naturalDuration ? null : next);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          hapticSelect();
          setOpen(true);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Duration, ${displayed} minutes`}
        accessibilityHint="Set a custom duration for this booking"
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: isCustom ? colors.brandSubtle : colors.surface,
            borderColor: isCustom ? colors.brand : colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Text variant="label" color={isCustom ? colors.brand : colors.textSecondary}>
          {displayed} min
        </Text>
        <SymbolView
          name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
          tintColor={isCustom ? colors.brand : colors.textMuted}
          size={13}
        />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text variant="subheading">Custom duration</Text>
            <Text variant="bodySmall" tone="muted">
              Applies only to this booking.
            </Text>
          </View>

          <View style={styles.presets}>
            {PRESETS.map((minutes) => (
              <Chip
                key={minutes}
                label={`${minutes}m`}
                selected={displayed === minutes}
                onPress={() => commit(minutes)}
              />
            ))}
          </View>

          <Stepper
            label="Fine-tune"
            value={`${displayed} min`}
            onDecrement={() => commit(displayed - STEP_MINUTES)}
            onIncrement={() => commit(displayed + STEP_MINUTES)}
          />

          <View style={styles.actions}>
            <Button
              label={`Reset (${naturalDuration}m)`}
              variant="secondary"
              style={styles.flex1}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            <Button label="Done" style={styles.flex1} onPress={() => setOpen(false)} />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  sheet: {
    gap: spacing.lg,
  },
  head: {
    gap: spacing.xxs,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
