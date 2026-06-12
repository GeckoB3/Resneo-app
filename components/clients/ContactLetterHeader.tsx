import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

import { NON_ALPHA_BUCKET } from './contactListData';

/**
 * Sticky letter divider rendered inside the flattened contacts FlatList.
 * Opaque background so sticky overlap (FlatList stickyHeaderIndices) reads
 * cleanly over the scrolling rows beneath it.
 */
function ContactLetterHeaderBase({ letter }: { letter: string }) {
  const { colors } = useTheme();
  const label = letter === NON_ALPHA_BUCKET ? '#' : letter;
  return (
    <View
      style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      accessibilityRole="header">
      <Text variant="label" tone="secondary" style={styles.letter}>
        {label}
      </Text>
    </View>
  );
}

export const ContactLetterHeader = memo(ContactLetterHeaderBase);

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  letter: {
    letterSpacing: 1,
  },
});
