import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';

type SectionHeaderProps = {
  title: string;
  /** Optional trailing element (e.g. a count, "See all" link, icon button). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Uppercase overline label that introduces a screen section — the consistent
 * way to title groups (replaces ad-hoc `<Text variant="heading">` titles).
 */
export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {action ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
