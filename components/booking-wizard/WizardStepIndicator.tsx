import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const STEP_LABELS = ['Service', 'Date', 'Time', 'Guest', 'Confirm'] as const;

type WizardStepIndicatorProps = {
  currentStep: number;
};

/** Segmented progress bar across the five appointment wizard steps. */
export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  const { colors } = useTheme();
  const label = STEP_LABELS[Math.min(currentStep, STEP_LABELS.length - 1)];

  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      <View style={styles.track}>
        {STEP_LABELS.map((step, index) => (
          <View
            key={step}
            style={[
              styles.segment,
              { backgroundColor: index <= currentStep ? colors.brand : colors.border },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted" style={styles.caption}>
        Step {currentStep + 1} of {STEP_LABELS.length} · {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
  },
  caption: {
    fontVariant: ['tabular-nums'],
  },
});
