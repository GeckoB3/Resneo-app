import { forwardRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The services setup's frame (web: one `Dialog` titled "Set up your services with AI", with a
 * description under the title, a three-step progress strip and a footer of actions). Like the
 * app's `StepShell`, but the strip carries the web's step names, and the scroll view is handed
 * to the setup so a step starts at the top and the review list keeps its place around the
 * add-on page.
 */

export const SETUP_STEP_LABELS = ['Add what you have', 'We read it', 'Check and add'] as const;

export const SetupShell = forwardRef<
  ScrollView,
  {
    visible: boolean;
    onClose: () => void;
    description: string;
    /** 0 to 2 for the three steps; null hides the strip (the finish screen). */
    stepIndex: number | null;
    footer: ReactNode;
    children: ReactNode;
    onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  }
>(function SetupShell({ visible, onClose, description, stepIndex, footer, children, onScroll }, ref) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="94%" fill>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="subheading" accessibilityRole="header">
            Set up your services with AI
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {description}
          </Text>
          {stepIndex !== null ? (
            <View style={styles.steps} accessibilityLabel={`Step ${stepIndex + 1} of 3, ${SETUP_STEP_LABELS[stepIndex]}`}>
              {SETUP_STEP_LABELS.map((label, i) => (
                <View key={label} style={styles.step}>
                  <View style={[styles.bar, { backgroundColor: i <= stepIndex ? colors.brand : colors.border }]} />
                  <Text variant="caption" tone={i === stepIndex ? 'default' : 'muted'} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <ScrollView
          ref={ref}
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={64}>
          {children}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View>
      </View>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  steps: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  step: {
    flex: 1,
    gap: spacing.xxs,
  },
  bar: {
    height: 4,
    borderRadius: radius.full,
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
