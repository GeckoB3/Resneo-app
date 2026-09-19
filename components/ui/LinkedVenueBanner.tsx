import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import {
  dismissBannerItem,
  getBannerDismissals,
  loadBannerDismissals,
  subscribeBannerDismissals,
} from '@/lib/linked/banner-dismissals';
import { bannerItemsFromFeed, filterVisibleBannerItems } from '@/lib/linked/banner-items';
import { setupCopy } from '@/lib/linked/setup-copy';
import { useIncomingLinks } from '@/lib/queries/useLinkedVenues';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing, typography } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * The persistent banner above the tabs for admins (web `LinkedAccountBanner.tsx`; plan §4): a
 * link request to review, naming the collective proposed with it; a request of ours still with
 * the other venue; a permission change to answer; a collective the host still has to set up; and
 * a collective whose host is setting the page up. Each row opens the right screen, and a row can
 * be dismissed for 24 hours on this device. Renders nothing for non-admin staff.
 *
 * There is intentionally no "acting as linked venue" context bar: the active linked venue is
 * already conveyed by the calendar's venue chip and the "Linked" badge on each linked grid.
 */
export function LinkedVenueBanner() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';
  // Admin-only route: gate the fetch so non-admin staff do not 403 every session.
  const incomingQuery = useIncomingLinks({ enabled: isAdmin });
  const dismissed = useSyncExternalStore(subscribeBannerDismissals, getBannerDismissals, getBannerDismissals);

  useEffect(() => {
    void loadBannerDismissals();
  }, []);

  const visible = useMemo(
    () => filterVisibleBannerItems(bannerItemsFromFeed(incomingQuery.data), dismissed),
    [incomingQuery.data, dismissed],
  );

  if (!isAdmin || visible.length === 0) return null;

  return (
    <View
      style={[
        styles.banner,
        // Clear the status bar: this renders above the screen's SafeAreaView.
        { paddingTop: insets.top + spacing.sm, backgroundColor: colors.surface, borderColor: colors.brand },
      ]}>
      {visible.map((item) => (
        <View key={item.id} style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={3}>
            {item.text}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.cta}
              onPress={() => router.push(item.href as Href)}
              hitSlop={8}
              style={({ pressed }) => [pressed ? styles.pressed : null]}>
              <Text style={[styles.linkText, { color: colors.brand }]}>{item.cta}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={setupCopy('banner.dismiss')}
              onPress={() => void dismissBannerItem(item.id)}
              hitSlop={8}
              style={({ pressed }) => [pressed ? styles.pressed : null]}>
              <Text style={[styles.dismissText, { color: colors.textMuted }]}>{setupCopy('banner.dismiss')}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
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
  dismissText: {
    ...typography.caption,
  },
});
