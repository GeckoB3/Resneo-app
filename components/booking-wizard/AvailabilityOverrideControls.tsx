import { Pressable, StyleSheet, View } from 'react-native';

import { HelpTooltip } from '@/components/ui/HelpTooltip';
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
 *
 * One line, as on the web: the tick, the label, and an (i) that opens the
 * explanation (the web shows it as the label's hover tooltip). The flow is a
 * full-screen route, so the tooltip's small Sheet is the only modal here.
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
    <View
      style={[
        styles.row,
        {
          backgroundColor: checked ? colors.warningSurface : 'transparent',
          borderColor: checked ? colors.warning : 'transparent',
        },
      ]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={AVAILABILITY_OVERRIDE_LABEL}
        accessibilityHint={AVAILABILITY_OVERRIDE_HELP}
        testID="availability-override-toggle"
        onPress={() => {
          hapticSelect();
          onChange(!checked);
        }}
        style={({ pressed }) => [styles.toggle, { opacity: pressed ? 0.8 : 1 }]}>
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
        <Text variant="bodySmall" numberOfLines={1} style={styles.label}>
          {AVAILABILITY_OVERRIDE_LABEL}
        </Text>
      </Pressable>
      <HelpTooltip
        iconSize={16}
        title={AVAILABILITY_OVERRIDE_LABEL}
        accessibilityLabel="What overriding availability does">
        {AVAILABILITY_OVERRIDE_HELP}
      </HelpTooltip>
    </View>
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
  // A single compact line under the step heading: a bordered box only while
  // the override is on, so an unticked row costs the service list no space.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 0,
    paddingLeft: spacing.sm,
    paddingRight: 0,
  },
  toggle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  check: {
    width: 20,
    height: 20,
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
