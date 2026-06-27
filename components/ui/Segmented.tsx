import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { useReduceMotion } from '@/lib/motion';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Let long option labels wrap onto two lines instead of truncating. */
  wrapLabels?: boolean;
};

/** Track inner padding and the gap between segments (also the thumb inset). */
const PAD = 3;
const GAP = 3;

/** Critically-damped slide — fast, settles cleanly, no overshoot wobble. */
const THUMB_SPRING = { damping: 28, stiffness: 380, mass: 0.7 };

/**
 * Segmented control — e.g. the Calendar's Day / Week / Month toggle.
 * The active "thumb" slides between segments with a spring (iOS-style)
 * instead of teleporting. Generic over the value union for type safety.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  wrapLabels = false,
}: SegmentedProps<T>) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);

  const count = options.length;
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const segmentWidth = trackWidth > 0 ? (trackWidth - PAD * 2 - GAP * (count - 1)) / count : 0;
  const selectedLabel = options[index]?.label ?? '';

  const translateX = useSharedValue(0);
  // Snap (don't animate) into place on first layout; spring on later changes.
  const hasPositioned = useRef(false);
  useEffect(() => {
    if (segmentWidth <= 0) return;
    const target = index * (segmentWidth + GAP);
    // Snap on first layout, or whenever reduce-motion is on; spring otherwise.
    if (hasPositioned.current && !reduceMotion) {
      translateX.set(withSpring(target, THUMB_SPRING));
    } else {
      translateX.set(target);
      hasPositioned.current = true;
    }
  }, [index, segmentWidth, translateX, reduceMotion]);

  const thumbAnimation = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityValue={{ text: selectedLabel }}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Each segment is a "tab"; the active one reports its selected state +
          value so VoiceOver/TalkBack announce e.g. "Week, selected, tab". */}
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            {
              width: segmentWidth,
              backgroundColor: colors.surfaceRaised,
              boxShadow: '0 1px 4px rgba(15, 23, 42, 0.08)',
              elevation: 1,
            },
            thumbAnimation,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityValue={isActive ? { text: selectedLabel } : undefined}
            onPress={() => {
              if (!isActive) {
                hapticSelect();
                onChange(option.value);
              }
            }}
            style={styles.segment}>
            <Text
              variant="label"
              color={isActive ? colors.brand : colors.textSecondary}
              numberOfLines={wrapLabels ? 2 : 1}
              style={styles.segmentLabel}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PAD,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: GAP,
  },
  thumb: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    bottom: PAD,
    borderRadius: radius.sm,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentLabel: {
    textAlign: 'center',
  },
});
