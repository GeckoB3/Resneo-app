import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useIncomingLinks } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * A thin global banner above the tabs: an admin nudge when other venues have
 * sent link requests waiting on a response — tapping opens the linked-venues
 * hub. Renders nothing otherwise (incl. for non-admin staff).
 *
 * There is intentionally no "acting as linked venue" context bar: the active
 * linked venue is already conveyed by the calendar's amber venue chip and the
 * "Linked" badge on each linked grid, and you switch venues from those chips
 * (or the Bookings filter sheet) — so a global context bar is redundant.
 */
export function LinkedVenueBanner() {
  const { colors } = useTheme();
  const router = useRouter();

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  // Admin-only route — gate the fetch so non-admin staff don't 403 every session.
  const incomingQuery = useIncomingLinks({ enabled: isAdmin });
  const incomingCount = incomingQuery.data?.incomingRequests.length ?? 0;

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
  incoming: {
    minHeight: 48,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...typography.caption,
  },
  linkText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
});
