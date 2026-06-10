import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { useDaySheet } from '@/lib/queries/useDaySheet';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { DaySheetBooking, DaySheetPeriod } from '@/types/day-sheet';

function Summary({
  bookings,
  covers,
  arriving,
}: {
  bookings: number;
  covers: number;
  arriving: number;
}) {
  return (
    <Card style={styles.summary}>
      <View style={styles.summaryItem}>
        <Text variant="display" style={styles.summaryValue}>
          {bookings}
        </Text>
        <Text variant="caption" tone="muted">
          bookings
        </Text>
      </View>
      <View style={styles.summaryItem}>
        <Text variant="display" style={styles.summaryValue}>
          {covers}
        </Text>
        <Text variant="caption" tone="muted">
          covers
        </Text>
      </View>
      <View style={styles.summaryItem}>
        <Text variant="display" style={styles.summaryValue}>
          {arriving}
        </Text>
        <Text variant="caption" tone="muted">
          arriving soon
        </Text>
      </View>
    </Card>
  );
}

function BookingRow({ booking, onPress }: { booking: DaySheetBooking; onPress: () => void }) {
  const { colors } = useTheme();
  const deposit =
    booking.deposit_amount_pence && booking.deposit_amount_pence > 0
      ? `£${(booking.deposit_amount_pence / 100).toFixed(0)} ${booking.deposit_status ?? ''}`.trim()
      : null;
  const dietary = booking.dietary_notes?.trim();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Text variant="bodyMedium" style={styles.rowTime}>
        {booking.booking_time.slice(0, 5)}
      </Text>
      <View style={styles.rowText}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {booking.guest_name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {booking.party_size} guest{booking.party_size === 1 ? '' : 's'}
          {booking.visit_count > 0 ? ` · ${booking.visit_count} visits` : ''}
          {deposit ? ` · ${deposit}` : ''}
        </Text>
        {dietary ? (
          <Text variant="caption" tone="danger" numberOfLines={1}>
            ⚠ {dietary}
          </Text>
        ) : null}
      </View>
      <StatusPill status={booking.status} />
    </Pressable>
  );
}

function Period({ period, onOpen }: { period: DaySheetPeriod; onOpen: (id: string) => void }) {
  if (period.bookings.length === 0) return null;
  return (
    <Card>
      <View style={styles.periodHeader}>
        <Text variant="label">{period.label}</Text>
        <Text variant="caption" tone="muted">
          {period.start_time.slice(0, 5)}–{period.end_time.slice(0, 5)} · {period.booked_covers}
          {period.max_covers != null ? `/${period.max_covers}` : ''} covers
        </Text>
      </View>
      <View style={styles.periodBody}>
        {period.bookings.map((booking) => (
          <BookingRow key={booking.id} booking={booking} onPress={() => onOpen(booking.id)} />
        ))}
      </View>
    </Card>
  );
}

export default function DaySheetScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [date, setDate] = useState(today);
  const query = useDaySheet(date);

  const openBooking = (id: string) => router.push(`/booking/${id}` as Href);

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Day sheet' }} />

      {/* Date navigator */}
      <View style={[styles.dateNav, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityLabel="Previous day"
          onPress={() => setDate((d) => addDaysToDateStr(d, -1))}
          style={styles.navBtn}>
          <Text variant="title" color={colors.brand}>
            ‹
          </Text>
        </Pressable>
        <Pressable onPress={() => setDate(today)} style={styles.dateLabel}>
          <Text variant="subheading">{formatDayHeading(date)}</Text>
          {date !== today ? (
            <Text variant="caption" tone="brand">
              Tap for today
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityLabel="Next day"
          onPress={() => setDate((d) => addDaysToDateStr(d, 1))}
          style={styles.navBtn}>
          <Text variant="title" color={colors.brand}>
            ›
          </Text>
        </Pressable>
      </View>

      {query.isLoading ? (
        <DetailSkeleton />
      ) : query.isError || !query.data ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={query.error instanceof ApiError ? query.error.message : 'Could not load the day sheet.'}
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }>
          <Summary
            bookings={query.data.summary.total_bookings}
            covers={query.data.summary.total_covers}
            arriving={query.data.summary.arriving_soon}
          />
          {query.data.summary.total_bookings === 0 ? (
            <EmptyState title="Nothing booked" message="No bookings for this day yet." />
          ) : (
            query.data.periods.map((period) => (
              <Period key={period.key} period={period} onOpen={openBooking} />
            ))
          )}
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontVariant: ['tabular-nums'],
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  periodBody: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTime: {
    width: 52,
    fontVariant: ['tabular-nums'],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
});
