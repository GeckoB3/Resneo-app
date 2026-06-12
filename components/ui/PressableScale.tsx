import { type ReactNode } from 'react';
import {
  Pressable,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticSelect } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Gentle press spring — a touch softer than Button so dense list rows don't bounce. */
const PRESS_SPRING = { damping: 22, stiffness: 420, mass: 0.6 };

type PressableScaleProps = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Light selection haptic on press (default false — rows often open a sheet). */
  haptic?: boolean;
  disabled?: boolean;
  accessibilityRole?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pressable that scales/dips with a spring on press — the same tactile feel as
 * Button/Fab, extracted so list rows (BookingRow, GuestRow) share it instead of
 * each settling for a flat opacity change.
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  haptic = false,
  disabled = false,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  style,
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * 0.02 }],
    opacity: 1 - pressed.get() * 0.06,
  }));

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={() => {
        if (haptic) hapticSelect();
        onPress?.();
      }}
      onLongPress={onLongPress}
      onPressIn={() => pressed.set(withSpring(1, PRESS_SPRING))}
      onPressOut={() => pressed.set(withSpring(0, PRESS_SPRING))}
      style={[animatedStyle, style]}>
      {children}
    </AnimatedPressable>
  );
}
