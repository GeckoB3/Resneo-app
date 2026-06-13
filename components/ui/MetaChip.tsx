import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type MetaChipProps = {
  /** SF Symbol / Material name (per-platform map). */
  icon: SymbolViewProps['name'];
  label: string;
};

/**
 * Subtle, icon-led fact pill — duration, party size, location, type, etc.
 * The compact, scannable metadata token used across hero cards and rows.
 */
export function MetaChip({ icon, label }: MetaChipProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <SymbolView name={icon} tintColor={colors.textSecondary} size={13} />
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
});
