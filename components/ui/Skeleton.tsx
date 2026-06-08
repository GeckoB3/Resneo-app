import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radius as radiusTokens } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Pulsing placeholder block shown while content loads. */
export function Skeleton({ width = '100%', height = 16, radius = radiusTokens.sm, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    // Gentle fade in/out loop to signal "loading" without distracting motion.
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.skeleton },
        animatedStyle,
        style,
      ]}
    />
  );
}
