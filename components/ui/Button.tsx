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

import { hapticTap } from '@/lib/haptics';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

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
  disabled,
  style,
  onPress,
  ...props
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const sizing = SIZES[size];

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
  const v = variantStyles[variant];

  function handlePress(event: GestureResponderEvent) {
    if (haptic) hapticTap();
    onPress?.(event);
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: sizing.height,
          paddingHorizontal: sizing.paddingH,
          backgroundColor: v.backgroundColor,
          borderColor: v.borderColor,
          opacity: isDisabled ? 0.45 : pressed ? 0.88 : 1,
          // Default: inherit parent alignment (stretches full-width in a column,
          // sizes to content in a row). `fullWidth` forces a stretch.
          alignSelf: fullWidth ? 'stretch' : undefined,
        },
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
    </Pressable>
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
