import { useEffect } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/motion';
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
  const reduceMotion = useReduceMotion();
  // Rest at a static mid-opacity when reduce-motion is on; the pulse animates
  // from this baseline otherwise so the first frame matches the static block.
  const opacity = useSharedValue(0.7);

  useEffect(() => {
    // Reduce-motion: skip the infinite pulse entirely and stay at a calm,
    // legible mid-opacity block (no withRepeat → no continuous animation).
    if (reduceMotion) {
      opacity.set(0.7);
      return;
    }
    // Gentle fade in/out loop to signal "loading" without distracting motion.
    opacity.set(0.5);
    opacity.set(
      withRepeat(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

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
