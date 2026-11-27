import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/useTheme';
import { spacing } from '@/theme/index';

// The detail panel's label and value row, and its tappable contact line, moved
// out of `BookingDetailContent.tsx` unchanged (codebase standards P5.2).

type SymbolName = SymbolViewProps['name'];

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

/** Tappable contact line with a leading glyph (call/email). */
export function ContactRow({
  icon,
  value,
  accessibilityLabel,
  onPress,
}: {
  icon: SymbolName;
  value: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.contactLine, { opacity: pressed ? 0.55 : 1 }]}>
      <SymbolView name={icon} tintColor={colors.brand} size={16} />
      <Text variant="bodySmall" color={colors.brand} numberOfLines={1} style={styles.contactLineText}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contactLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  contactLineText: {
    flex: 1,
    minWidth: 0,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
