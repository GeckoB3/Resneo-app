import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useReduceMotion } from '@/lib/motion';
import { radius as radiusTokens } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

/** Width of the moving highlight band, as a fraction of the block width. */
const BAND = 0.4;
const SHIMMER_DURATION = 1100;

/**
 * Skeleton — a loading placeholder block.
 *
 * Reduce-motion (or the rare zero-width measure): render a calm, static
 * mid-tone block — no SVG, no animation. This early return is split into its own
 * branch BEFORE the animated component mounts so no animation hooks run in that
 * path (and the static block is what reduce-motion users see).
 *
 * Otherwise: a left→right shimmer built from a `react-native-svg` `LinearGradient`
 * whose stops sweep across the block, driven by a single looping Reanimated shared
 * value (UI thread). No `expo-linear-gradient` — the gradient rides the already
 * present `react-native-svg` dependency.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = radiusTokens.sm,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();

  // Static block for reduce-motion users — calm, legible, and animation-free.
  if (reduceMotion) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton }, style]}
      />
    );
  }

  return <ShimmerSkeleton width={width} height={height} radius={radius} style={style} />;
}

function ShimmerSkeleton({ width, height, radius, style }: Required<Omit<SkeletonProps, 'style'>> & { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  // 0 → 1 sweeps the highlight band from off-left to off-right and loops.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withRepeat(withTiming(1, { duration: SHIMMER_DURATION, easing: Easing.inOut(Easing.ease) }), -1, false),
    );
  }, [progress]);

  // Sweep the gradient's x window across [-BAND, 1 + BAND] in object-bounding-box
  // units so the highlight enters from the left and exits the right each loop.
  const animatedProps = useAnimatedProps(() => {
    const t = progress.get();
    const start = -BAND + t * (1 + BAND);
    return {
      x1: `${start}`,
      x2: `${start + BAND}`,
    };
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: colors.skeleton }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <AnimatedLinearGradient id="skeletonShimmer" y1="0" y2="0" animatedProps={animatedProps}>
            <Stop offset="0" stopColor={colors.skeleton} stopOpacity="0" />
            <Stop offset="0.5" stopColor={colors.surfaceRaised} stopOpacity="0.65" />
            <Stop offset="1" stopColor={colors.skeleton} stopOpacity="0" />
          </AnimatedLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#skeletonShimmer)" />
      </Svg>
    </View>
  );
}
