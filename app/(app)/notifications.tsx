import { format, parseISO } from 'date-fns';
import { Stack } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticTap } from '@/lib/haptics';
import { useMarkNotificationsRead, useNotifications } from '@/lib/queries/useNotifications';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { VenueNotification } from '@/types/notifications';

function formatWhen(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM, HH:mm');
  } catch {
    return iso;
  }
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: VenueNotification;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.rowMarker}>
        {!notification.read ? (
          <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} />
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {notification.title}
        </Text>
        {notification.body ? (
          <Text variant="bodySmall" tone="secondary" numberOfLines={3}>
            {notification.body}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {formatWhen(notification.createdAt)}
          {notification.actorVenueName ? ` · ${notification.actorVenueName}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  const handleRowPress = (notification: VenueNotification) => {
    if (!notification.read) {
      hapticTap();
      markRead.mutate({ ids: [notification.id] });
    }
  };

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
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }>
          {unreadCount > 0 ? (
            <Button
              label={`Mark all ${unreadCount} as read`}
              variant="secondary"
              fullWidth
              loading={markRead.isPending}
              onPress={() => markRead.mutate({ all: true })}
            />
          ) : null}

          {notifications.length === 0 ? (
            <EmptyState
              title="No notifications"
              message="Updates about linked calendars and bookings will appear here."
            />
          ) : (
            <Card padded={false}>
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onPress={() => handleRowPress(notification)}
                />
              ))}
            </Card>
          )}
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
});
