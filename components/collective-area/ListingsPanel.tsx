/**
 * "Classes, events & resources" tab of the collective area (web parity, 2026-09-21: the host's
 * `CollectiveListingsPanel`). The host switches a member's class type, event series or resource
 * on to the combined page; a member sees its own items and can take them off. Prices and payment
 * rules stay the owning venue's, so they are read-only here. Rooms are never shared between
 * venues: a listing only says where a room can be booked from.
 */
import { StyleSheet, Switch, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  useCollectiveListingToggle,
  useCollectiveListings,
  type ListableItem,
  type ListableVenue,
  type ListingEntityType,
} from '@/lib/queries/useCollectiveListings';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const KINDS: { kind: ListingEntityType; title: string; empty: string }[] = [
  { kind: 'class', title: 'Classes', empty: 'No class types yet.' },
  { kind: 'event', title: 'Events', empty: 'No upcoming events.' },
  { kind: 'resource', title: 'Resources', empty: 'No bookable rooms or equipment.' },
];

export function ListingsPanel({
  collectiveId,
  collectiveName,
}: {
  collectiveId: string;
  collectiveName: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const query = useCollectiveListings(collectiveId);
  const toggle = useCollectiveListingToggle(collectiveId);

  if (query.isLoading && !query.data) {
    return (
      <View style={styles.stack}>
        <Skeleton height={96} />
        <Skeleton height={140} />
      </View>
    );
  }
  if (!query.data) {
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : 'Could not load the listings.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  const venues = data.is_host ? data.venues : data.venues.filter((v) => v.venueId === data.my_venue_id);
  const anyItems = venues.some((v) => v.items.length > 0);

  const onToggle = async (venue: ListableVenue, item: ListableItem) => {
    const listed = item.listing?.status === 'active';
    try {
      if (listed && item.listing) {
        await toggle.mutateAsync({ action: 'withdraw', listingId: item.listing.id });
        toast.success(`${item.name} is off the combined page.`);
      } else {
        await toggle.mutateAsync({
          action: 'list',
          venueId: venue.venueId,
          entityType: item.entityType,
          entityId: item.entityId,
        });
        toast.success(`${item.name} is on the combined page.`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That change did not save.');
    }
  };

  return (
    <View style={styles.stack}>
      <Card>
        <Text variant="label">Classes, events and resources on the {collectiveName} page</Text>
        <Text variant="bodySmall" tone="secondary" style={styles.gapTop}>
          {data.is_host
            ? "Switch an item on to show it on the combined page. Guests see which venue runs it, and the booking lands on that venue's calendar. Prices and payment rules are set by the venue that runs each item."
            : 'The host chooses what appears on the combined page. You can take any of your own items off it here. Prices and payment rules stay yours.'}
        </Text>
        <Text variant="caption" tone="muted" style={styles.gapTop}>
          Rooms and equipment are never shared between venues. Listing a room only says where it can be
          booked from; bookings still land on your own calendar.
        </Text>
      </Card>

      {!anyItems ? (
        <EmptyState
          title="Nothing to list yet"
          message="Set up classes, events or resources on each venue first, then come back here."
        />
      ) : null}

      {venues.map((venue) => (
        <View key={venue.venueId} style={styles.section}>
          <View style={styles.venueHeader}>
            <Text variant="label">{venue.venueName}</Text>
            {venue.isHost ? <Badge label="Host" tone="neutral" /> : null}
          </View>
          {KINDS.map(({ kind, title, empty }) => {
            const items = venue.items.filter((i) => i.entityType === kind);
            return (
              <View key={kind} style={styles.kind}>
                <Text variant="caption" tone="muted">
                  {title}
                </Text>
                {items.length === 0 ? (
                  <Text variant="bodySmall" tone="secondary">
                    {empty}
                  </Text>
                ) : (
                  <Card padded={false}>
                    {items.map((item, index) => {
                      const listed = item.listing?.status === 'active';
                      const canAct = data.is_host || venue.venueId === data.my_venue_id;
                      // A member cannot list; it can only take its own items off (decision B).
                      const memberCanOnlyWithdraw = !data.is_host && !listed;
                      return (
                        <View
                          key={`${item.entityType}:${item.entityId}`}
                          style={[
                            styles.row,
                            index > 0 ? [styles.rowDivider, { borderTopColor: colors.border }] : null,
                          ]}
                        >
                          <View style={styles.rowText}>
                            <Text variant="bodySmall" numberOfLines={1}>
                              {item.name}
                              {!item.isActive ? (
                                <Text variant="caption" tone="danger">
                                  {'  Inactive at the venue'}
                                </Text>
                              ) : null}
                            </Text>
                            {item.detail ? (
                              <Text variant="caption" tone="muted" numberOfLines={1}>
                                {item.detail}
                              </Text>
                            ) : null}
                            <Text variant="caption" tone="muted">
                              {listed
                                ? 'On the combined page'
                                : memberCanOnlyWithdraw
                                  ? 'Not listed (the host lists items)'
                                  : 'Not listed'}
                            </Text>
                          </View>
                          <Switch
                            value={listed}
                            disabled={!canAct || memberCanOnlyWithdraw || toggle.isPending}
                            onValueChange={() => void onToggle(venue, item)}
                            accessibilityLabel={`${listed ? 'Withdraw' : 'List'} ${item.name}`}
                          />
                        </View>
                      );
                    })}
                  </Card>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  gapTop: { marginTop: spacing.xs },
  section: { gap: spacing.sm },
  venueHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kind: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
});
