import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LinkedVenueSwitcherSheet } from '@/components/linked/LinkedVenueSwitcherSheet';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Shown when staff are acting in a linked-owner venue context (cross-venue /
 * chair rental). Surfaces the active venue name, a "Switch" affordance that
 * opens the venue switcher, and a "Use primary venue" action that clears the
 * context. A no-op (renders nothing) when no linked venue is active.
 */
export function LinkedVenueBanner() {
  const { colors } = useTheme();
  const { ownerVenueId, ownerVenueName, clearOwnerVenue } = useLinkedVenueContext();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  if (!ownerVenueId) {
    return null;
  }

  return (
    <>
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.brand }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Acting as ${ownerVenueName ?? 'a linked venue'} — switch venue`}
          hitSlop={8}
          onPress={() => setSwitcherOpen(true)}
          style={({ pressed }) => [styles.context, pressed ? styles.pressed : null]}>
          <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
            Linked venue ·{' '}
            <Text style={[styles.name, { color: colors.text }]}>
              {ownerVenueName ?? 'Linked venue'}
            </Text>
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to primary venue"
          hitSlop={8}
          onPress={clearOwnerVenue}
          style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}>
          <Text style={[styles.linkText, { color: colors.brand }]}>Use primary venue</Text>
        </Pressable>
      </View>

      <LinkedVenueSwitcherSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
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
  context: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...typography.caption,
  },
  name: {
    ...typography.caption,
    fontWeight: '600',
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  linkText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
});
