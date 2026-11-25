import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import type { useBookingActivity } from '@/lib/queries/useBookingActivity';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import {
  BOOKING_ACTIVITY_FILTER_LABELS,
  BOOKING_ACTIVITY_KINDS,
  BOOKING_ACTIVITY_STATE_LABELS,
  type BookingActivityFilter,
  type BookingActivityItem,
  type BookingActivityKind,
} from '@/types/booking-activity';

export const BOOKING_ACTIVITY_COPY = {
  emptyTitle: 'No booking activity',
  emptyMessage: 'Nothing yet. New bookings, cancellations and moves will appear here.',
  mineLabel: 'Just my clients',
  onlyMineNote: "You see your own clients' bookings.",
  loadError: 'Could not load booking activity.',
  moreError: 'Could not load more.',
} as const;

/** Each kind's small icon and colours. */
function kindVisual(
  kind: BookingActivityKind,
  colors: ReturnType<typeof useTheme>['colors'],
): { name: SymbolViewProps['name']; fg: string; bg: string; label: string } {
  switch (kind) {
    case 'cancelled':
      return {
        name: { ios: 'xmark', android: 'close', web: 'close' },
        fg: colors.danger,
        bg: colors.dangerSurface,
        label: 'Cancelled',
      };
    case 'moved':
      return {
        name: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
        fg: colors.brand,
        bg: colors.brandSubtle,
        label: 'Moved',
      };
    default:
      return {
        name: { ios: 'plus', android: 'add', web: 'add' },
        fg: colors.success,
        bg: colors.successSurface,
        label: 'New',
      };
  }
}

/** "Online · Today 10:42am": who did it and when, either one alone when the other is missing. */
export function bookingActivityMeta(item: Pick<BookingActivityItem, 'by_label' | 'at_label'>): string {
  return [item.by_label, item.at_label].filter((part) => typeof part === 'string' && part.trim()).join(' · ');
}

function ActivityRow({
  item,
  isLast,
  onPress,
}: {
  item: BookingActivityItem;
  isLast: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const visual = kindVisual(item.kind, colors);
  const meta = bookingActivityMeta(item);
  const stateLabel = item.state ? BOOKING_ACTIVITY_STATE_LABELS[item.state] ?? null : null;
  const a11y = [item.client_name, item.text, meta, stateLabel].filter(Boolean).join('. ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Opens the booking"
      testID={`booking-activity-row-${item.id}`}
      style={({ pressed }) => [
        styles.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        { backgroundColor: pressed ? colors.surface : colors.surfaceRaised },
      ]}>
      <View
        style={[styles.kindIcon, { backgroundColor: visual.bg }]}
        accessibilityLabel={visual.label}>
        <SymbolView name={visual.name} tintColor={visual.fg} size={14} />
      </View>
      <View style={styles.rowBody}>
        <Text variant="label" numberOfLines={1}>
          {item.client_name}
        </Text>
        <Text variant="bodySmall" tone="secondary">
          {item.text}
        </Text>
        {meta || stateLabel ? (
          <View style={styles.metaRow}>
            {meta ? (
              <Text variant="caption" tone="muted" style={styles.metaText}>
                {meta}
              </Text>
            ) : null}
            {stateLabel ? <Badge label={stateLabel} tone="warning" /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

type Activity = ReturnType<typeof useBookingActivity>;

/**
 * The bell's Bookings tab (web booking-activity plan, BA2): new bookings, cancellations and moves,
 * newest first, as the server words them. Filter chips, "Just my clients" for someone who works a
 * calendar and sees the whole business, pull to refresh, and the next 50 on reaching the end.
 */
export function BookingActivityList({
  activity,
  kind,
  onKindChange,
  mine,
  onMineChange,
  onOpenBooking,
}: {
  activity: Activity;
  kind: BookingActivityFilter;
  onKindChange: (kind: BookingActivityFilter) => void;
  mine: boolean;
  onMineChange: (mine: boolean) => void;
  onOpenBooking: (bookingId: string) => void;
}) {
  const { colors } = useTheme();
  const { query, items, hasCalendars, onlyMine } = activity;

  const showMineSwitch = hasCalendars && !onlyMine;
  const loading = query.isLoading || query.isPlaceholderData;

  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  };

  const header = (
    <View style={styles.filters}>
      <View style={styles.chipRow}>
        {BOOKING_ACTIVITY_KINDS.map((value) => (
          <Chip
            key={value}
            label={BOOKING_ACTIVITY_FILTER_LABELS[value]}
            selected={kind === value}
            onPress={() => {
              if (kind !== value) onKindChange(value);
            }}
          />
        ))}
      </View>
      {showMineSwitch ? (
        <View style={styles.mineRow}>
          <Text variant="bodySmall" tone="secondary" style={styles.mineLabel}>
            {BOOKING_ACTIVITY_COPY.mineLabel}
          </Text>
          <Switch
            value={mine}
            onValueChange={onMineChange}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor={colors.surfaceRaised}
            accessibilityLabel={BOOKING_ACTIVITY_COPY.mineLabel}
          />
        </View>
      ) : onlyMine ? (
        <Text variant="caption" tone="muted" style={styles.onlyMineNote}>
          {BOOKING_ACTIVITY_COPY.onlyMineNote}
        </Text>
      ) : null}
    </View>
  );

  let body: ReactNode;
  if (loading) {
    body = <ListSkeleton />;
  } else if (query.isError && !query.data) {
    body = (
      <View style={styles.stateWrap}>
        <ErrorState
          message={query.error instanceof ApiError ? query.error.message : BOOKING_ACTIVITY_COPY.loadError}
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ActivityRow
            item={item}
            isLast={index === items.length - 1}
            onPress={() => onOpenBooking(item.booking_id)}
          />
        )}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.content}
        ListEmptyComponent={
          <EmptyState
            illustration="bookings"
            title={BOOKING_ACTIVITY_COPY.emptyTitle}
            message={BOOKING_ACTIVITY_COPY.emptyMessage}
          />
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : query.isFetchNextPageError ? (
            <View style={styles.footer}>
              <Text variant="bodySmall" tone="danger">
                {BOOKING_ACTIVITY_COPY.moreError}
              </Text>
              <Button label="Try again" variant="secondary" onPress={() => void query.fetchNextPage()} />
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={colors.brand}
          />
        }
      />
    );
  }

  return (
    <View style={styles.fill}>
      {header}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  filters: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
    minHeight: 44,
  },
  mineLabel: {
    flex: 1,
    minWidth: 0,
  },
  onlyMineNote: {
    paddingVertical: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  emptyContent: {
    flexGrow: 1,
    padding: spacing.base,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 44,
  },
  kindIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  metaText: {
    flexShrink: 1,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.base,
  },
});
