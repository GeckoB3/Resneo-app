import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticTap } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type QuickActionProps = {
  /** SF Symbol / Material name (per-platform map). */
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  /** Glyph (and, when `filled`, container) colour — defaults to the brand. */
  tint?: string;
  /** Solid-fill the icon container (for a single emphasised action). */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A circular icon-in-a-rounded-square with a tiny caption label — the unit used
 * in quick-action rows (Call · Message · Reschedule · …) on hero/profile cards.
 */
export function QuickAction({ icon, label, onPress, tint, filled = false, style }: QuickActionProps) {
  const { colors } = useTheme();
  const color = tint ?? colors.brand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.55 : 1 }, style]}>
      <View
        style={[
          styles.icon,
          filled
            ? { backgroundColor: color, borderColor: color }
            : { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <SymbolView name={icon} tintColor={filled ? colors.onBrand : color} size={20} />
      </View>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 64,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
