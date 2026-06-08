import { SymbolView } from 'expo-symbols';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CalendarDayGrid } from '@/components/calendar/CalendarDayGrid';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { WeekStrip } from '@/components/calendar/WeekStrip';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { newBookingActionLabel } from '@/lib/booking/terminology';
import {
  addDaysToDateStr,
  addMonthsToDateStr,
  calendarDateInTimeZone,
  formatDayHeading,
  formatMonthLabel,
  formatRangeLabel,
  getCalendarWeekFromDate,
  getMonthRangeFromDate,
  type DateRange,
} from '@/lib/dates/venue-dates';
import { useCalendarGrid } from '@/lib/queries/useCalendarGrid';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueContext } from '@/providers/VenueProvider';
import { brand, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Practitioner } from '@/types/practitioner';

type Scope = 'day' | 'week' | 'month';

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** Appointments default to the brand navy when a practitioner has no colour. */
const DEFAULT_PRACTITIONER_COLOR = brand[600];

/** Current wall-clock time (minutes since midnight) in the venue timezone. */
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

/**
 * Calendar tab (default tab — `index` route). Day/Week/Month views of the
 * practitioner schedule, with long-press to reschedule.
 */
export default function CalendarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue, terminology } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [scope, setScope] = useState<Scope>('day');
  const [anchor, setAnchor] = useState<string>(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);

  const week = useMemo(() => getCalendarWeekFromDate(anchor), [anchor]);
  const range = useMemo<DateRange>(() => {
    if (scope === 'week') return { from: week.from, to: week.to };
    if (scope === 'month') return getMonthRangeFromDate(anchor);
    return { from: anchor, to: anchor };
  }, [scope, anchor, week]);

  const practitionersQuery = usePractitioners();
  const practitioners = useMemo<Practitioner[]>(() => {
    const list = practitionersQuery.data?.practitioners ?? [];
    return [...list].filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order);
  }, [practitionersQuery.data]);

  const calendarIds = useMemo(() => practitioners.map((p) => p.id), [practitioners]);

  const gridQuery = useCalendarGrid({
    calendarIds,
    from: range.from,
    to: range.to,
    enabled: calendarIds.length > 0,
  });

  const effectiveId =
    selectedId && calendarIds.includes(selectedId) ? selectedId : calendarIds[0] ?? null;
  const selectedPractitioner = practitioners.find((p) => p.id === effectiveId) ?? null;

  const day = useMemo(() => {
    const calendar = gridQuery.data?.calendars.find((c) => c.calendarId === effectiveId);
    return calendar?.dates.find((d) => d.date === anchor) ?? null;
  }, [gridQuery.data, effectiveId, anchor]);

  /** date → total bookings across all calendars (for week strip + month grid). */
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const calendar of gridQuery.data?.calendars ?? []) {
      for (const d of calendar.dates) {
        map[d.date] = (map[d.date] ?? 0) + d.bookings.length;
      }
    }
    return map;
  }, [gridQuery.data]);

  const isToday = anchor === today;
  const nowMinutes = isToday ? nowMinutesInTz(timeZone) : null;

  const label =
    scope === 'day'
      ? formatDayHeading(anchor)
      : scope === 'week'
        ? formatRangeLabel(week.from, week.to)
        : formatMonthLabel(anchor);

  const step = useCallback(
    (direction: -1 | 1) => {
      setAnchor((current) => {
        if (scope === 'month') return addMonthsToDateStr(current, direction);
        if (scope === 'week') return addDaysToDateStr(current, direction * 7);
        return addDaysToDateStr(current, direction);
      });
    },
    [scope],
  );

  const goToday = useCallback(() => setAnchor(today), [today]);

  const openBooking = useCallback(
    (id: string) => router.push(`/booking/${id}` as Href),
    [router],
  );

  const createAt = useCallback(
    (time: string) => {
      router.push({
        pathname: '/booking/new',
        params: { date: anchor, practitionerId: effectiveId ?? '', time },
      });
    },
    [router, anchor, effectiveId],
  );

  const startReschedule = useCallback(
    (bookingId: string) => {
      const booking = day?.bookings.find((b) => b.id === bookingId);
      if (booking) {
        setRescheduleTarget({
          id: booking.id,
          guestName: booking.guestName,
          date: anchor,
          time: booking.startTime,
        });
      }
    },
    [day, anchor],
  );

  const dayGrid = (
    <CalendarDayGrid
      bookings={day?.bookings ?? []}
      workingHours={day?.workingHours ?? []}
      practitionerColor={selectedPractitioner?.colour ?? DEFAULT_PRACTITIONER_COLOR}
      nowMinutes={nowMinutes}
      onBlockPress={openBooking}
      onBlockLongPress={startReschedule}
      onEmptyPress={createAt}
    />
  );

  return (
    <Screen padded={false}>
      {practitionersQuery.isLoading ? (
        <LoadingState message="Loading calendar…" />
      ) : practitionersQuery.isError ? (
        <ErrorState
          message={
            practitionersQuery.error instanceof ApiError
              ? practitionersQuery.error.message
              : practitionersQuery.error?.message ?? 'Could not load practitioners.'
          }
          onRetry={() => void practitionersQuery.refetch()}
        />
      ) : practitioners.length === 0 ? (
        <EmptyState
          title="No practitioners yet"
          message="Add practitioners on the web dashboard and they'll appear here as calendar columns."
        />
      ) : (
        <>
          <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
            <Segmented value={scope} onChange={setScope} options={SCOPE_OPTIONS} />

            <View style={styles.dateNav}>
              <ChevButton dir="left" onPress={() => step(-1)} />
              <Pressable
                onPress={goToday}
                accessibilityRole="button"
                accessibilityHint="Jump to today"
                style={styles.dateLabel}>
                <Text variant="subheading" numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
              <ChevButton dir="right" onPress={() => step(1)} />
            </View>

            {scope !== 'month' ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {practitioners.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={p.id === effectiveId}
                    onPress={() => setSelectedId(p.id)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>

          {gridQuery.isLoading ? (
            <LoadingState message="Loading appointments…" />
          ) : gridQuery.isError ? (
            <ErrorState
              message={
                gridQuery.error instanceof ApiError
                  ? gridQuery.error.message
                  : gridQuery.error?.message ?? 'Could not load the calendar.'
              }
              onRetry={() => void gridQuery.refetch()}
            />
          ) : scope === 'month' ? (
            <ScrollView>
              <MonthGrid
                anchor={anchor}
                today={today}
                counts={counts}
                onSelectDay={(date) => {
                  setAnchor(date);
                  setScope('day');
                }}
              />
            </ScrollView>
          ) : scope === 'week' ? (
            <View style={styles.weekBody}>
              <View style={[styles.weekStripWrap, { borderBottomColor: colors.border }]}>
                <WeekStrip
                  days={week.days}
                  selectedDate={anchor}
                  today={today}
                  counts={counts}
                  onSelectDay={setAnchor}
                />
              </View>
              {dayGrid}
            </View>
          ) : (
            dayGrid
          )}

          <Fab
            label={newBookingActionLabel(terminology)}
            onPress={() => router.push('/booking/new')}
          />
        </>
      )}

      <RescheduleSheet target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
    </Screen>
  );
}

function ChevButton({ dir, onPress }: { dir: 'left' | 'right'; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? 'Previous' : 'Next'}
      hitSlop={8}
      style={styles.chevButton}>
      <SymbolView
        name={
          dir === 'left'
            ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
            : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
        }
        tintColor={colors.text}
        size={22}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    padding: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateLabel: {
    flex: 1,
    alignItems: 'center',
  },
  chevButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  weekBody: {
    flex: 1,
  },
  weekStripWrap: {
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
