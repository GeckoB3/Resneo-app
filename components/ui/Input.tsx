import { type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { minTouchTarget, motion, radius, spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  /** Helper text shown below when there is no error. */
  helper?: string;
  /** Optional adornment rendered inside the field, before the input. */
  leftIcon?: ReactNode;
};

/**
 * Labelled text field with an animated focus ring + error state. 16px font
 * avoids the iOS zoom-on-focus that disrupts quick data entry.
 *
 * IMPORTANT: the focus ring is driven by a Reanimated shared value rather than
 * React state. Calling setState inside onFocus re-commits the view tree on the
 * new architecture (Fabric) and makes Android drop focus — the keyboard opens
 * then instantly dismisses. A shared-value update stays on the UI thread, so
 * the TextInput keeps focus.
 */
export function Input({
  label,
  error,
  helper,
  leftIcon,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const { colors } = useTheme();
  const focus = useSharedValue(0);

  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.danger
      : interpolateColor(focus.value, [0, 1], [colors.border, colors.brand]),
  }));

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (e) => {
    // Reanimated shared values are intentionally mutable; the lint rule doesn't know that.
    // eslint-disable-next-line react-hooks/immutability
    focus.value = withTiming(1, { duration: motion.fast });
    onFocus?.(e);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (e) => {
    // eslint-disable-next-line react-hooks/immutability
    focus.value = withTiming(0, { duration: motion.fast });
    onBlur?.(e);
  };

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}
      <Animated.View style={[styles.field, { backgroundColor: colors.surface }, animatedBorder]}>
        {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }, style]}
          {...props}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.md,
  },
});
