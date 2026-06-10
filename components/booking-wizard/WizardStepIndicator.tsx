import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const DEFAULT_LABELS = ['Service', 'Date', 'Time', 'Guest', 'Confirm'];

type WizardStepIndicatorProps = {
  currentStep: number;
  /** Step labels for the active flow (varies when add-ons are present). */
  labels?: string[];
};

/** Segmented progress bar across the appointment wizard steps. */
export function WizardStepIndicator({ currentStep, labels = DEFAULT_LABELS }: WizardStepIndicatorProps) {
  const { colors } = useTheme();
  const label = labels[Math.min(currentStep, labels.length - 1)];

  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      <View style={styles.track}>
        {labels.map((step, index) => (
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
        Step {currentStep + 1} of {labels.length} · {label}
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
