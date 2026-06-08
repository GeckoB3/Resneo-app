import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ChipProps = {
  label: string;
  selected?: boolean;
  /** Optional trailing count, e.g. a filter result tally. */
  count?: number;
  onPress?: () => void;
};

/** Selectable filter pill — used in the Bookings/Calendar filter bars. */
export function Chip({ label, selected = false, count, onPress }: ChipProps) {
  const { colors } = useTheme();

  function handlePress() {
    hapticSelect();
    onPress?.();
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.brand : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Text variant="label" color={selected ? colors.onBrand : colors.textSecondary}>
        {label}
      </Text>
      {typeof count === 'number' ? (
        <View
          style={[
            styles.count,
            { backgroundColor: selected ? colors.onBrand : colors.borderStrong },
          ]}>
          <Text variant="caption" color={selected ? colors.brand : colors.text}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  count: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
