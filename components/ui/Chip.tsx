import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type ChipProps = {
  label: string;
  selected?: boolean;
  /** Optional trailing count, e.g. a filter result tally. */
  count?: number;
  /** Tint the selected fill (e.g. a rose "Needs compliance" chip). */
  selectedColor?: string;
  onPress?: () => void;
  /** When set, renders a trailing × that clears this filter (a removable chip). */
  onRemove?: () => void;
};

/** Selectable filter pill — used in the Bookings/Calendar/Contacts filter bars. */
export function Chip({ label, selected = false, count, selectedColor, onPress, onRemove }: ChipProps) {
  const { colors } = useTheme();
  const fill = selectedColor ?? colors.brand;

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
          backgroundColor: selected ? fill : colors.surface,
          borderColor: selected ? fill : colors.border,
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
          <Text variant="caption" color={selected ? fill : colors.text}>
            {count}
          </Text>
        </View>
      ) : null}
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label}`}>
          <SymbolView
            name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
            tintColor={selected ? colors.onBrand : colors.textMuted}
            size={15}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchTarget,
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
