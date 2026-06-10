import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticTap } from '@/lib/haptics';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Snappy, slightly-bouncy press spring — shared by the FAB's in/out states. */
const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

type FabProps = {
  onPress: () => void;
  /** Screen-reader label, e.g. "New appointment". */
  accessibilityLabel: string;
};

/**
 * Compact floating "+" button — self-positions bottom-right above the tab bar.
 * Deliberately small (52pt circle) so it stays out of the content's way;
 * presses scale down with a spring for a tactile, Apple-like feel.
 */
export function Fab({ onPress, accessibilityLabel }: FabProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        scale.set(withSpring(0.9, PRESS_SPRING));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, PRESS_SPRING));
      }}
      onPress={() => {
        hapticTap();
        onPress();
      }}
      hitSlop={8}
      style={[styles.fab, { backgroundColor: colors.brand }, elevation.raised, animatedStyle]}>
      <SymbolView
        name={{ ios: 'plus', android: 'add', web: 'add' }}
        tintColor={colors.onBrand}
        size={24}
      />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.base,
    bottom: spacing.xl,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
