import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  GuestBookingHistoryRow,
  GuestDetailProfile,
  GuestDetailStats,
} from '@/types/guest-detail';

function formatGuestName(guest: GuestDetailProfile): string {
  const parts = [guest.first_name, guest.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

function formatCurrencyPence(pence: number): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
  } catch {
    return `£${(pence / 100).toFixed(2)}`;
  }
}

function StatTile({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text variant="overline" tone="muted">
        {label}
      </Text>
      <Text variant="title">{value}</Text>
    </View>
  );
}

function HistoryRow({ booking, onPress, divider }: {
  booking: GuestBookingHistoryRow;
  onPress: () => void;
  divider: boolean;
}) {
  const { colors } = useTheme();
  const party =
    typeof booking.party_size === 'number' && booking.party_size > 0
      ? ` · ${booking.party_size} guest${booking.party_size === 1 ? '' : 's'}`
      : '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.historyRow,
        divider ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.historyTime}>
        <Text variant="label">{booking.booking_date}</Text>
        {booking.booking_time ? (
          <Text variant="caption" tone="muted">
            {booking.booking_time.slice(0, 5)}
          </Text>
        ) : null}
      </View>
      <View style={styles.historyMain}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {booking.detail_label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {booking.kind_label}
          {party}
        </Text>
      </View>
      <StatusPill status={booking.status} />
    </Pressable>
  );
}

function statTiles(stats: GuestDetailStats): { label: string; value: string }[] {
  return [
    { label: 'Bookings', value: String(stats.total_bookings) },
    { label: 'No-shows', value: String(stats.no_shows) },
    { label: 'Cancellations', value: String(stats.cancellations) },
    {
      label: 'Deposits paid',
      value: stats.total_deposit_pence_paid > 0 ? formatCurrencyPence(stats.total_deposit_pence_paid) : '—',
    },
  ];
}

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guestId = typeof id === 'string' ? id : undefined;
  const detailQuery = useGuestDetail(guestId);

  const handleBookingPress = useCallback(
    (bookingId: string) => router.push(`/booking/${bookingId}` as Href),
    [router],
  );

  const handleNewBookingForClient = useCallback(() => {
    if (!guestId) return;
    router.push({ pathname: '/booking/new', params: { guestId } } as never);
  }, [guestId, router]);

  const tiles = useMemo(
    () => (detailQuery.data ? statTiles(detailQuery.data.stats) : []),
    [detailQuery.data],
  );

  if (!guestId) {
    return (
      <Screen>
        <ErrorState message="Missing client id in the route." />
      </Screen>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <Screen padded={false}>
        <DetailSkeleton />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const message =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : detailQuery.error?.message ?? 'Could not load this client.';
    return (
      <Screen>
        <ErrorState message={message} onRetry={() => void detailQuery.refetch()} />
      </Screen>
    );
  }

  const { guest, stats, booking_history } = detailQuery.data;
  const name = formatGuestName(guest);

  return (
    <Screen padded={false} scroll={false}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Avatar name={name} size={56} />
          <View style={styles.headerText}>
            <Text variant="title" numberOfLines={1}>
              {name}
            </Text>
            {guest.phone ? (
              <Text variant="bodySmall" tone="secondary">
                {guest.phone}
              </Text>
            ) : null}
            {guest.email ? (
              <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                {guest.email}
              </Text>
            ) : null}
          </View>
        </View>

        {guest.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {guest.tags.map((tag) => (
              <Badge key={tag} label={tag} tone="brand" />
            ))}
          </View>
        ) : null}

        <View style={styles.statsRow}>
          {tiles.map((t) => (
            <StatTile key={t.label} label={t.label} value={t.value} />
          ))}
        </View>

        {guest.customer_profile_notes ? (
          <Card>
            <Text variant="label">Notes</Text>
            <Text variant="bodySmall" tone="secondary" style={styles.notesText}>
              {guest.customer_profile_notes}
            </Text>
          </Card>
        ) : null}

        <Button label="New booking for this client" fullWidth onPress={handleNewBookingForClient} />

        <Text variant="heading" style={styles.sectionTitle}>
          Booking history
        </Text>
        {booking_history.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            message={
              stats.days_as_customer > 0
                ? `Client since ${stats.days_as_customer} day${stats.days_as_customer === 1 ? '' : 's'} ago.`
                : 'This client has no booking history.'
            }
          />
        ) : (
          <Card padded={false}>
            {booking_history.map((booking, index) => (
              <HistoryRow
                key={booking.id}
                booking={booking}
                divider={index < booking_history.length - 1}
                onPress={() => handleBookingPress(booking.id)}
              />
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statTile: {
    flexGrow: 1,
    flexBasis: '47%',
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  notesText: {
    marginTop: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  historyTime: {
    width: 84,
    gap: 2,
  },
  historyMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
