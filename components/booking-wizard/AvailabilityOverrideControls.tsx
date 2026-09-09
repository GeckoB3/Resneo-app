import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import {
  AVAILABILITY_OVERRIDE_BOX_TITLE,
  AVAILABILITY_OVERRIDE_HELP,
  AVAILABILITY_OVERRIDE_LABEL,
  AVAILABILITY_OVERRIDE_NOTHING,
} from '@/lib/booking/availability-override';
import { hapticSelect } from '@/lib/haptics';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The staff "Override availability" tick box (web `AvailabilityOverrideToggle`,
 * #187), on the first step of the staff booking flow: the person picker on a
 * staff-first venue, the service list otherwise. Never on a public page.
 */
export function AvailabilityOverrideToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${AVAILABILITY_OVERRIDE_LABEL}. ${AVAILABILITY_OVERRIDE_HELP}`}
      testID="availability-override-toggle"
      onPress={() => {
        hapticSelect();
        onChange(!checked);
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: checked ? colors.warningSurface : colors.surface,
          borderColor: checked ? colors.warning : colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View
        style={[
          styles.check,
          {
            borderColor: checked ? colors.warning : colors.borderStrong,
            backgroundColor: checked ? colors.warning : 'transparent',
          },
        ]}>
        {checked ? <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text> : null}
      </View>
      <View style={styles.label}>
        <Text variant="bodyMedium">{AVAILABILITY_OVERRIDE_LABEL}</Text>
        <Text variant="caption" tone="muted">
          {AVAILABILITY_OVERRIDE_HELP}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * "What this overrides": the engine's reasons in plain words, from the dry run
 * on the review step and from the create on the confirmation. Nothing here
 * stops the save.
 */
export function AvailabilityOverrideWarnings({ warnings }: { warnings: readonly string[] }) {
  const { colors } = useTheme();
  return (
    <View
      testID="override-warnings"
      accessibilityRole="summary"
      style={[styles.box, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
      <Text variant="label">{AVAILABILITY_OVERRIDE_BOX_TITLE}</Text>
      {warnings.length > 0 ? (
        warnings.map((w, i) => (
          <Text key={`${i}-${w}`} variant="bodySmall" tone="secondary">
            • {w}
          </Text>
        ))
      ) : (
        <Text variant="bodySmall" tone="secondary">
          {AVAILABILITY_OVERRIDE_NOTHING}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  label: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 13,
    fontFamily: fonts.bold,
    lineHeight: 16,
  },
  box: {
    gap: spacing.xs,
    padding: spacing.base,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
