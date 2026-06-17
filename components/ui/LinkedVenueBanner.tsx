import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LinkedVenueSwitcherSheet } from '@/components/linked/LinkedVenueSwitcherSheet';
import { useIncomingLinks } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A thin global banner above the tabs with two jobs (active context wins):
 *
 *  1. Active linked-venue context (cross-venue / chair rental): the venue name,
 *     a tap to open the venue switcher, and "Use primary venue" to clear it.
 *  2. Otherwise, an admin nudge when other venues have sent link requests that
 *     are waiting on a response — tapping opens the linked-venues hub.
 *
 * A no-op (renders nothing) when no linked venue is active and there are no
 * incoming requests (or the viewer is not an admin).
 */
export function LinkedVenueBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const { ownerVenueId, ownerVenueName, clearOwnerVenue } = useLinkedVenueContext();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  // Admin-only route — gate the fetch so non-admin staff don't 403 every session.
  const incomingQuery = useIncomingLinks({ enabled: isAdmin });
  const incomingCount = incomingQuery.data?.incomingRequests.length ?? 0;

  if (ownerVenueId) {
    return (
      <>
        <View
          style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.brand }]}>
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

  if (isAdmin && incomingCount > 0) {
    const label =
      incomingCount === 1
        ? '1 venue wants to link with you'
        : `${incomingCount} venues want to link with you`;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} — review`}
        onPress={() => router.push('/linked-venues' as Href)}
        style={({ pressed }) => [
          styles.banner,
          styles.incoming,
          { backgroundColor: colors.surface, borderColor: colors.brand },
          pressed ? styles.pressed : null,
        ]}>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.linkText, { color: colors.brand }]}>Review</Text>
      </Pressable>
    );
  }

  return null;
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
  incoming: {
    minHeight: 48,
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
