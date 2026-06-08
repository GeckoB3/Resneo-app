import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Shown when staff are acting in a linked-owner venue context (chair rental).
 * Full venue name + switcher UI lands in Phase 10 v1.1.
 */
export function LinkedVenueBanner() {
  const { colors } = useTheme();
  const { ownerVenueId, setOwnerVenueId } = useLinkedVenueContext();

  if (!ownerVenueId) {
    return null;
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.brand }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        Linked venue context active
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to primary venue"
        hitSlop={8}
        onPress={() => setOwnerVenueId(null)}
        style={({ pressed }) => [styles.link, pressed ? styles.linkPressed : null]}>
        <Text style={[styles.linkText, { color: colors.brand }]}>Use primary venue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  text: {
    ...typography.caption,
    flex: 1,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  linkPressed: {
    opacity: 0.7,
  },
  linkText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
});
