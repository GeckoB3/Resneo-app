import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticTap } from '@/lib/haptics';
import { minTouchTarget, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS_SPRING = { damping: 20, stiffness: 480, mass: 0.5 };

type IconButtonVariant = 'plain' | 'tinted' | 'bordered';

type IconButtonProps = {
  /** SF Symbol / Material name. Pass a string or a per-platform map. */
  icon: SymbolViewProps['name'];
  onPress: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  /** Highlight as active (e.g. a filter that's currently applied). */
  active?: boolean;
  size?: number;
  iconSize?: number;
  /** Tint override for the glyph. */
  tint?: string;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Square icon button with a 44pt touch target and the shared press spring.
 * Unifies the ChevButton/NavButton/iconButton/StepButton variations that were
 * hand-rolled per screen.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  active = false,
  size = minTouchTarget,
  iconSize = 20,
  tint,
  disabled = false,
  haptic = true,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * 0.06 }],
    opacity: 1 - pressed.get() * 0.12,
  }));

  const bg =
    active || variant === 'tinted'
      ? colors.brandSubtle
      : variant === 'bordered'
        ? colors.surface
        : 'transparent';
  const borderColor = variant === 'bordered' ? colors.border : 'transparent';
  const glyph = tint ?? (active ? colors.brand : colors.textSecondary);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        if (haptic) hapticTap();
        onPress();
      }}
      onPressIn={() => pressed.set(withSpring(1, PRESS_SPRING))}
      onPressOut={() => pressed.set(withSpring(0, PRESS_SPRING))}
      style={[
        styles.base,
        { width: size, height: size, backgroundColor: bg, borderColor, borderWidth: variant === 'bordered' ? 1 : 0 },
        disabled ? styles.disabled : null,
        animatedStyle,
        style,
      ]}>
      <SymbolView name={icon} tintColor={glyph} size={iconSize} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
