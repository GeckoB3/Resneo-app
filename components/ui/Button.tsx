import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticTap } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/motion';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Quick, controlled press spring — subtle enough for dense forms. */
const PRESS_SPRING = { damping: 20, stiffness: 480, mass: 0.5 };

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretch to fill the parent width. */
  fullWidth?: boolean;
  /** Optional icon node rendered before the label. */
  leftIcon?: ReactNode;
  /** Light haptic on press (default true). */
  haptic?: boolean;
  /**
   * Override the variant's colours (e.g. web-parity per-status action
   * colours: Confirm blue, Start green, Arrived amber).
   */
  customColors?: { background: string; text: string; border?: string };
  style?: StyleProp<ViewStyle>;
};

const SIZES: Record<ButtonSize, { height: number; paddingH: number; fontSize: number }> = {
  sm: { height: 36, paddingH: spacing.base, fontSize: 14 },
  md: { height: minTouchTarget, paddingH: spacing.xl, fontSize: 16 },
  lg: { height: 52, paddingH: spacing.xl, fontSize: 17 },
};

/**
 * Primary action button. Large touch target for counter-side use, with
 * variant/size options, a loading spinner, and built-in haptic feedback.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  haptic = true,
  customColors,
  disabled,
  style,
  onPress,
  hitSlop,
  ...props
}: ButtonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const isDisabled = disabled || loading;
  const sizing = SIZES[size];
  // Guarantee a >=44pt touch target even when the visual height is smaller
  // (the compact `sm` size renders at 36pt). Callers can still override hitSlop.
  const padV = Math.max(0, Math.ceil((minTouchTarget - sizing.height) / 2));
  const autoHitSlop = padV > 0 ? { top: padV, bottom: padV } : undefined;

  // Spring scale + dip on press — tactile without being bouncy. A single
  // progress value drives both so they always stay in sync.
  const pressed = useSharedValue(0);
  const pressAnimation = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * 0.03 }],
    opacity: 1 - pressed.get() * 0.12,
  }));

  const variantStyles: Record<
    ButtonVariant,
    { backgroundColor: string; text: string; borderColor: string }
  > = {
    primary: { backgroundColor: colors.brand, text: colors.onBrand, borderColor: colors.brand },
    accent: { backgroundColor: colors.accent, text: colors.onAccent, borderColor: colors.accent },
    secondary: { backgroundColor: colors.surfaceRaised, text: colors.text, borderColor: colors.borderStrong },
    ghost: { backgroundColor: 'transparent', text: colors.brand, borderColor: 'transparent' },
    danger: { backgroundColor: colors.danger, text: colors.onDanger, borderColor: colors.danger },
  };
  const resolved = customColors
    ? {
        backgroundColor: customColors.background,
        text: customColors.text,
        borderColor: customColors.border ?? customColors.background,
      }
    : variantStyles[variant];
  // Disabled: don't just dim the variant (white-on-navy at 0.45 opacity fails
  // AA). Swap to explicit muted fill/text/border tokens that keep readable
  // contrast in both themes. `loading` keeps the variant colours so the spinner
  // stays on-brand. ghost variants have no fill — keep them transparent.
  const showDisabledFill = isDisabled && !loading;
  const v = showDisabledFill
    ? {
        backgroundColor: variant === 'ghost' ? 'transparent' : colors.surface,
        text: colors.textMuted,
        borderColor: variant === 'ghost' ? 'transparent' : colors.border,
      }
    : resolved;

  function handlePress(event: GestureResponderEvent) {
    if (haptic) hapticTap();
    onPress?.(event);
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={hitSlop ?? autoHitSlop}
      onPress={handlePress}
      onPressIn={() => {
        pressed.set(reduceMotion ? 0 : withSpring(1, PRESS_SPRING));
      }}
      onPressOut={() => {
        pressed.set(reduceMotion ? 0 : withSpring(0, PRESS_SPRING));
      }}
      style={[
        styles.base,
        {
          minHeight: sizing.height,
          paddingHorizontal: sizing.paddingH,
          backgroundColor: v.backgroundColor,
          borderColor: v.borderColor,
          // Default: inherit parent alignment (stretches full-width in a column,
          // sizes to content in a row). `fullWidth` forces a stretch.
          alignSelf: fullWidth ? 'stretch' : undefined,
        },
        pressAnimation,
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <Text style={[styles.label, { color: v.text, fontSize: sizing.fontSize }]}>{label}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.semibold,
  },
});
