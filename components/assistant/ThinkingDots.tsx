import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/motion';
import { useTheme } from '@/theme/useTheme';

/**
 * Three dots pulsing in turn, shown beside "Finding the answer" while Ask
 * ResNeo is working on the first token (web `AssistantMessageList`, the same
 * 150ms stagger).
 *
 * The wait is the one moment the screen has nothing to show: the question has
 * scrolled up and no answer has started. A still line of text there reads as a
 * stall, so this is what says the app is still listening.
 *
 * Reduce motion is honoured — the dots stay, at their resting opacity, so the
 * row still reads as a placeholder rather than as an answer.
 */
const DOT_DELAYS = [0, 150, 300];
const PULSE_MS = 420;

export function ThinkingDots() {
  return (
    <View
      testID="assistant-thinking-dots"
      style={styles.row}
      // The words next to them carry the meaning; the dots are decoration.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {DOT_DELAYS.map((delay) => (
        <Dot key={delay} delay={delay} />
      ))}
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: PULSE_MS }), withTiming(0, { duration: PULSE_MS })),
          -1,
          false,
        ),
      ),
    );
    // A dot that outlives its answer would keep the UI thread busy for nothing.
    return () => cancelAnimation(pulse);
  }, [delay, pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.get() * 0.65,
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: colors.textMuted }, animatedStyle]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
