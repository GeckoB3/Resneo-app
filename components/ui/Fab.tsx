import { type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { elevation, fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type FabProps = {
  /** Optional label — when present the FAB is an extended pill, else a circle. */
  label?: string;
  onPress: () => void;
  /** Custom icon node; defaults to a "+" glyph. */
  icon?: ReactNode;
  accessibilityLabel?: string;
};

/**
 * Floating action button — self-positions bottom-right above the tab bar.
 * Used on Calendar and Bookings to start a new booking.
 */
export function Fab({ label, onPress, icon, accessibilityLabel }: FabProps) {
  const { colors } = useTheme();

  function handlePress() {
    hapticTap();
    onPress();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? 'New'}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.fab,
        label ? styles.extended : styles.circle,
        { backgroundColor: colors.brand, opacity: pressed ? 0.9 : 1 },
        elevation.raised,
      ]}>
      {icon ?? (
        <Text color={colors.onBrand} style={styles.plus}>
          +
        </Text>
      )}
      {label ? (
        <Text variant="label" color={colors.onBrand}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.base,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
  },
  extended: {
    height: 52,
    paddingHorizontal: spacing.lg,
  },
  circle: {
    width: 56,
    height: 56,
  },
  plus: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 28,
  },
});
