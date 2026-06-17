import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Press-and-hold auto-repeat for stepper buttons: one step on press, then
 * repeats after 400ms — slow at first, fast after ~1.3s — so single taps give
 * 1-minute precision while a hold covers big jumps.
 */
function useAutoRepeat(onStep: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeats = useRef(0);
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    repeats.current = 0;
  }, []);

  const start = useCallback(() => {
    stop();
    stepRef.current();
    const tick = () => {
      stepRef.current();
      repeats.current += 1;
      timer.current = setTimeout(tick, repeats.current < 12 ? 110 : 35);
    };
    timer.current = setTimeout(tick, 400);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { start, stop };
}

/** Labelled −/value/+ row with hold-to-repeat buttons (1-unit precision). */
export function Stepper({
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
      {/*
        Expose the control as a single "adjustable" element so VoiceOver/TalkBack
        users can swipe up/down to change it and hear the current value, instead
        of tabbing through two unlabelled +/− buttons. The visible buttons remain
        for touch; they're hidden from the a11y tree to avoid duplicate stops.
      */}
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        accessibilityActions={[
          { name: 'increment', label: 'Increase' },
          { name: 'decrement', label: 'Decrease' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') onIncrement();
          else if (event.nativeEvent.actionName === 'decrement') onDecrement();
        }}
        style={styles.stepperControl}>
        <StepButton symbol="−" onStep={onDecrement} />
        <Text
          variant="subheading"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.stepperValue}>
          {value}
        </Text>
        <StepButton symbol="+" onStep={onIncrement} />
      </View>
    </View>
  );
}

function StepButton({ symbol, onStep }: { symbol: string; onStep: () => void }) {
  const { colors } = useTheme();
  const { start, stop } = useAutoRepeat(onStep);
  return (
    <Pressable
      onPressIn={start}
      onPressOut={stop}
      // The parent control is the single "adjustable" a11y element; hide these
      // touch buttons from the a11y tree so screen readers don't double-stop.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.stepSymbol, { color: colors.brand }]}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
