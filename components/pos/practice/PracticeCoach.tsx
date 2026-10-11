import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { practiceT } from './copy';
import { coachText, nextCoachStep, PRACTICE_COACH_STEPS, type PracticeCoachStep } from './model';

/**
 * One coach mark of the practice sale (design W11, B12: "Tip 2 of 5", the tip, Next, Skip the
 * tips). It sits in the screen's flow beside the part it describes, so nothing floats over the
 * real controls, and it is a plain view rather than an overlay, so it never stacks a window.
 * Renders nothing unless `at` is the tip showing.
 */
export function PracticeCoachMark({
  at,
  current,
  limitPercent,
  onNext,
  onSkip,
  onShown,
}: {
  at: PracticeCoachStep;
  /** The tip showing now, or null once the tips are done or skipped. */
  current: PracticeCoachStep | null;
  limitPercent: number | null | undefined;
  onNext: (next: PracticeCoachStep | null) => void;
  onSkip: () => void;
  /** Where the tip landed (its top, in its parent's coordinates), so the screen can scroll to it. */
  onShown?: (y: number) => void;
}) {
  const { colors } = useTheme();
  if (current !== at) return null;
  const n = PRACTICE_COACH_STEPS.indexOf(at) + 1;
  const next = nextCoachStep(at);
  return (
    <View
      onLayout={(e) => onShown?.(e.nativeEvent.layout.y)}
      style={[styles.coach, { backgroundColor: colors.brand }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      testID={`practice-coach-${at}`}>
      <Text variant="overline" color={colors.onBrand} style={styles.step}>
        {practiceT('setup.practice.coach.step', { n, total: PRACTICE_COACH_STEPS.length })}
      </Text>
      <Text variant="bodyMedium" color={colors.onBrand}>
        {coachText(at, limitPercent)}
      </Text>
      <View style={styles.buttons}>
        <Button
          label={next ? practiceT('setup.practice.coach.next') : practiceT('setup.practice.coach.done')}
          variant="accent"
          size="sm"
          onPress={() => onNext(next)}
        />
        {next ? (
          <Button
            label={practiceT('setup.practice.coach.skip')}
            variant="ghost"
            size="sm"
            customColors={{ background: 'transparent', text: colors.onBrand }}
            onPress={onSkip}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coach: { borderRadius: radius.card, padding: spacing.md, gap: spacing.sm },
  step: { opacity: 0.85 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
