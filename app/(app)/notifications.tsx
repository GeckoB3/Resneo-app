import { Stack, useRouter, type Href } from 'expo-router';
import { Pressable, RefreshControl, SectionList, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { groupByDay } from '@/lib/notifications/groupByDay';
import { parseNotificationRoute } from '@/lib/notifications/parseNotificationRoute';
import { relativeTime } from '@/lib/notifications/relativeTime';
import {
  useLinkedNotificationPrefs,
  useMarkNotificationsRead,
  useNotifications,
  useUpdateLinkedNotificationPrefs,
} from '@/lib/queries/useNotifications';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  LINKED_NOTIFICATION_CATEGORIES,
  LINKED_NOTIFICATION_LABELS,
  type LinkedNotificationCategory,
  type VenueNotification,
} from '@/types/notifications';

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------

function NotificationRow({
  notification,
  isLast,
  onPress,
}: {
  notification: VenueNotification;
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const unreadBg = !notification.read ? colors.brandSubtle : undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}${notification.read ? '' : ', unread'}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.surface : unreadBg ?? colors.surfaceRaised },
      ]}>
      {/* Unread dot marker */}
      <View style={styles.rowMarker}>
        {!notification.read ? (
          <View style={[styles.unreadDot, { backgroundColor: colors.brand }]} />
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleRow}>
          <Text variant="bodyMedium" numberOfLines={2} style={styles.rowTitle}>
            {notification.title}
          </Text>
          <Text variant="caption" tone="muted" style={styles.rowTime}>
            {relativeTime(notification.createdAt)}
          </Text>
        </View>
        {notification.body ? (
          <Text variant="bodySmall" tone="secondary" numberOfLines={3}>
            {notification.body}
          </Text>
        ) : null}
        {notification.actorVenueName ? (
          <Text variant="caption" tone="muted">
            {notification.actorVenueName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.surface }]}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Email preferences section (admin-only, §17.4)
// ---------------------------------------------------------------------------

function EmailPrefRow({
  category,
  value,
  disabled,
  onToggle,
}: {
  category: LinkedNotificationCategory;
  value: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const label = LINKED_NOTIFICATION_LABELS[category];
  const sentence = `Email me when a linked venue ${label.charAt(0).toLowerCase()}${label.slice(1)}`;

  return (
    <View style={[styles.prefRow, { borderBottomColor: colors.border }]}>
      <Text variant="bodySmall" style={styles.prefLabel} tone="secondary">
        {sentence}
      </Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.surfaceRaised}
        accessibilityLabel={sentence}
      />
    </View>
  );
}

function EmailPrefsSection() {
  const { colors } = useTheme();
  const toast = useToast();
  const prefsQuery = useLinkedNotificationPrefs();
  const updatePrefs = useUpdateLinkedNotificationPrefs();

  const prefs = prefsQuery.data;

  const handleToggle = (category: LinkedNotificationCategory) => {
    if (!prefs) return;
    const next = !prefs[category];
    hapticTap();
    updatePrefs.mutate(
      { [category]: next },
      {
        onError: () => {
          toast.error('Could not save that change. Please try again.');
        },
      },
    );
  };

  return (
    <View style={styles.prefsContainer}>
      <View style={[styles.prefsSectionHeader, { borderBottomColor: colors.border }]}>
        <Text variant="label" tone="secondary">
          Email notifications
        </Text>
        <Text variant="caption" tone="muted" style={styles.prefsSubtitle}>
          Controls email channel only. In-app notifications always appear here.
        </Text>
      </View>

      <Card padded={false}>
        {prefsQuery.isLoading ? (
          <View style={styles.prefLoading}>
            <Text variant="bodySmall" tone="muted">
              Loading preferences…
            </Text>
          </View>
        ) : prefsQuery.isError ? (
          <View style={styles.prefLoading}>
            <Text variant="bodySmall" tone="danger">
              Could not load preferences.
            </Text>
          </View>
        ) : (
          LINKED_NOTIFICATION_CATEGORIES.map((cat) => (
            <EmailPrefRow
              key={cat}
              category={cat}
              value={prefs?.[cat] ?? false}
              disabled={updatePrefs.isPending || prefsQuery.isLoading}
              onToggle={() => handleToggle(cat)}
            />
          ))
        )}
      </Card>

      <Text variant="caption" tone="muted" style={styles.prefsNote}>
        Notes-only edits can be noisy; they email only if you turn the last option on.
        Emails go to your venue&apos;s contact address and active admins.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();
  const staffQuery = useStaffMe();
  const isAdmin = staffQuery.data?.staff?.role === 'admin';

  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;
  const sections = groupByDay(notifications);

  const handleRowPress = (notification: VenueNotification) => {
    hapticTap();

    // Optimistic mark-read fires immediately via onMutate in the mutation.
    if (!notification.read) {
      markRead.mutate({ ids: [notification.id] });
    }

    // Deep-link navigation.
    const route = parseNotificationRoute(notification.href);
    if (route?.type === 'calendar') {
      // Open the calendar tab on the notification's day (the screen reads ?date=).
      router.push(`/(app)/(tabs)/?date=${route.date}` as Href);
    } else if (route?.type === 'settings') {
      // Settings / linked-accounts — navigate to more tab.
      router.push('/(app)/(tabs)/settings' as Href);
    }
  };

  const handleMarkAllRead = () => {
    hapticSuccess();
    markRead.mutate(
      { all: true },
      {
        onError: () => {
          toast.error('Could not mark notifications as read. Please try again.');
        },
      },
    );
  };

  const renderItem = ({ item, index, section }: {
    item: VenueNotification;
    index: number;
    section: { data: VenueNotification[] };
  }) => {
    const isLast = index === section.data.length - 1;
    return (
      <NotificationRow
        notification={item}
        isLast={isLast}
        onPress={() => handleRowPress(item)}
      />
    );
  };

  const renderSectionHeader = ({ section }: { section: { label: string } }) => (
    <SectionHeader title={section.label} />
  );

  const renderSectionFooter = () => <View style={styles.sectionGap} />;

  // Injected as a list header — compact inline button matching web style.
  const listHeader = unreadCount > 0 ? (
    <View style={styles.listHeaderRow}>
      <Pressable
        onPress={handleMarkAllRead}
        disabled={markRead.isPending}
        accessibilityRole="button"
        accessibilityLabel={`Mark all ${unreadCount} notifications as read`}
        style={({ pressed }) => [styles.markAllButton, { opacity: pressed ? 0.6 : 1 }]}>
        <Text
          variant="label"
          style={{ color: markRead.isPending ? colors.textMuted : colors.brand }}>
          Mark all read
        </Text>
      </Pressable>
    </View>
  ) : null;

  // Email prefs section injected as list footer (admin only).
  const listFooter = isAdmin ? (
    <EmailPrefsSection />
  ) : (
    <View style={styles.footerSpacer} />
  );

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Notifications' }} />

      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError ? query.error.message : 'Could not load notifications.'
            }
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.stateWrap}>
          {listHeader}
          <EmptyState
            title="No notifications"
            message="Activity from your linked venues will appear here."
          />
          {isAdmin ? <EmailPrefsSection /> : null}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={styles.content}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.brand}
            />
          }
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: 0,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  // Row
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 44,
  },
  rowMarker: {
    width: 12,
    alignItems: 'center',
    paddingTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
  },
  rowTime: {
    flexShrink: 0,
  },
  // Section header
  sectionHeader: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionGap: {
    height: spacing.xs,
  },
  // Mark-all row
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  markAllButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  // Email prefs
  prefsContainer: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  prefsSectionHeader: {
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  prefsSubtitle: {
    marginTop: 2,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prefLabel: {
    flex: 1,
    minWidth: 0,
  },
  prefLoading: {
    padding: spacing.base,
    alignItems: 'center',
  },
  prefsNote: {
    paddingHorizontal: spacing.xs,
  },
  footerSpacer: {
    height: spacing.xl,
  },
});
