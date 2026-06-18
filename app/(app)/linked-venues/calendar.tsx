import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { LinkedBookingDetailSheet } from '@/components/linked/LinkedBookingDetailSheet';
import { LinkedVenueCalendarGrid } from '@/components/linked/LinkedVenueCalendarGrid';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { calendarDateInTimeZone, formatDayHeading } from '@/lib/dates/venue-dates';
import { useLinkedCalendar } from '@/lib/queries/useLinkedCalendar';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkedBooking, LinkedVenueCalendar } from '@/types/linked-venues';

/** Current minutes-since-midnight in the venue timezone (for the now-line). */
function nowMinutesInTz(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

type SheetState =
  | { kind: 'detail'; venue: LinkedVenueCalendar; booking: LinkedBooking }
  | null;

/**
 * Dedicated linked-calendar screen (any staff role — NOT admin-gated). Shows a
 * date picker and one grant-gated `LinkedVenueCalendarGrid` per accessible
 * linked venue for that day. Cross-venue bookings are created/edited/cancelled
 * via the per-grid sheets. 60s refetch is the realtime fallback (handled in the
 * hook). Reached from the link detail / the venue switcher.
 */
export default function LinkedCalendarScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [date, setDate] = useState(today);
  const [sheet, setSheet] = useState<SheetState>(null);

  // Single-day fetch (from === to). The hook polls every 60s as a fallback.
  const query = useLinkedCalendar({ from: date, to: date });
  const venues = useMemo<LinkedVenueCalendar[]>(() => query.data?.venues ?? [], [query.data?.venues]);

  // Tick the now-line each minute, only while viewing today.
  const [tick, setTick] = useState(0);
  const isToday = date === today;
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [isToday]);
  const nowMinutes = useMemo(
    () => (isToday ? nowMinutesInTz(timeZone) : null),
    // `tick` is an intentional dependency — it advances the clock each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToday, timeZone, tick],
  );

  const header = (
    <>
      <Stack.Screen options={{ title: 'Linked calendar' }} />
      <View style={styles.toolbar}>
        <DatePickerField value={date} onChange={setDate} accessibilityLabel="Calendar date" />
        <View style={styles.toolbarRight}>
          <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
            {formatDayHeading(date)}
          </Text>
          {!isToday ? (
            <Button label="Today" size="sm" variant="secondary" onPress={() => setDate(today)} />
          ) : null}
        </View>
      </View>
    </>
  );

  if (query.isLoading) {
    return (
      <Screen padded={false}>
        <View style={styles.toolbarWrap}>{header}</View>
        <ListSkeleton rows={4} />
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={
            query.error instanceof ApiError ? query.error.message : 'Could not load linked calendars.'
          }
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  if (venues.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={
            <SymbolView
              name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
              tintColor={colors.brand}
              size={40}
            />
          }
          title="No linked calendars"
          message="No linked venues share calendar visibility with you yet. Set up a link under Linked venues in Settings."
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      padded={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.brand}
          colors={[colors.brand]}
        />
      }>
      {header}

      {/* Each grid renders `embedded` (full height, no own vertical scroll) so
          this Screen's ScrollView owns the single vertical scroll — otherwise
          each grid's own ScrollView swallows the pan and the venues below the
          first become unreachable. The Screen owns pull-to-refresh. */}
      {venues.map((v) => (
        <LinkedVenueCalendarGrid
          key={v.venueId}
          embedded
          venue={v}
          date={date}
          nowMinutes={nowMinutes}
          onOpenBooking={(booking) => setSheet({ kind: 'detail', venue: v, booking })}
          onCreate={() =>
            router.push({
              pathname: '/booking/new',
              params: { ownerVenueId: v.venueId, ownerVenueName: v.venueName, date },
            })
          }
        />
      ))}

      <LinkedBookingDetailSheet
        visible={sheet?.kind === 'detail'}
        venue={sheet?.kind === 'detail' ? sheet.venue : null}
        booking={sheet?.kind === 'detail' ? sheet.booking : null}
        onClose={() => setSheet(null)}
        onSaved={() => void query.refetch()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing['3xl'],
    gap: spacing.xl,
  },
  toolbarWrap: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
});
