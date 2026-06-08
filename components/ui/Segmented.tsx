import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
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
};

/**
 * Segmented control — e.g. the Calendar's Day / Week / Month toggle.
 * Generic over the value union so callers stay type-safe.
 */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (!isActive) {
                hapticSelect();
                onChange(option.value);
              }
            }}
            style={[
              styles.segment,
              isActive && {
                backgroundColor: colors.surfaceRaised,
                shadowColor: '#0F172A',
                shadowOpacity: 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              },
            ]}>
            <Text
              variant="label"
              color={isActive ? colors.brand : colors.textSecondary}
              numberOfLines={1}>
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
    padding: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
});
