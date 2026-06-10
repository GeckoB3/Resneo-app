import { SymbolView } from 'expo-symbols';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';

import { BookingRow } from '@/components/bookings/BookingRow';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
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
  getMonthRangeFromDate,
  getWeekRangeFromDate,
  type DateRange,
} from '@/lib/dates/venue-dates';
import { useBookingsList } from '@/lib/queries/useBookingsList';
import { useBookingsRange } from '@/lib/queries/useBookingsRange';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type Scope = 'day' | 'week' | 'month';

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** Confirmed = explicit status OR either attendance timestamp (web semantics). */
function isAttendanceConfirmed(b: BookingListRow): boolean {
  return (
    b.status === 'Confirmed' ||
    !!b.guest_attendance_confirmed_at ||
    !!b.staff_attendance_confirmed_at
  );
}

/** Status filters — labels + semantics mirror the web AppointmentBookingsDashboard. */
const STATUS_FILTERS: { key: string; label: string; matches: (b: BookingListRow) => boolean }[] = [
  { key: 'All', label: 'All', matches: () => true },
  { key: 'Pending', label: 'Pending', matches: (b) => b.status === 'Pending' },
  {
    key: 'Booked',
    label: 'Booked',
    matches: (b) => b.status === 'Booked' && !isAttendanceConfirmed(b),
  },
  { key: 'Confirmed', label: 'Confirmed', matches: isAttendanceConfirmed },
  { key: 'Started', label: 'Started', matches: (b) => b.status === 'Seated' },
  { key: 'Completed', label: 'Completed', matches: (b) => b.status === 'Completed' },
  { key: 'Cancelled', label: 'Cancelled', matches: (b) => b.status === 'Cancelled' },
  { key: 'NoShow', label: 'No show', matches: (b) => b.status === 'No-Show' },
];

type BookingSection = SectionListData<BookingListRow, { title: string; date: string }>;

function rangeFor(scope: Scope, anchor: string): DateRange {
  if (scope === 'week') {
    const week = getWeekRangeFromDate(anchor);
    return { from: week.from, to: week.to };
  }
  if (scope === 'month') {
    return getMonthRangeFromDate(anchor);
  }
  return { from: anchor, to: anchor };
}

export default function BookingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue, terminology, pricingTier, bookingModel } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const isAppointment = isAppointmentFromVenue(pricingTier, bookingModel);

  const [scope, setScope] = useState<Scope>('day');
  const [anchor, setAnchor] = useState<string>(() => calendarDateInTimeZone(new Date(), timeZone));
  const [status, setStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [practitionerFilter, setPractitionerFilter] = useState<string | null>(null);

  const practitionersQuery = usePractitioners();
  const practitioners = useMemo(
    () =>
      (practitionersQuery.data?.practitioners ?? [])
        .filter((p) => p.is_active)
        .sort((a, b) => a.sort_order - b.sort_order),
    [practitionersQuery.data],
  );

  const range = useMemo(() => rangeFor(scope, anchor), [scope, anchor]);

  // Day uses the single-date endpoint (all statuses); week/month use the range endpoint.
  const dayQuery = useBookingsList({ date: anchor, timeZone, enabled: scope === 'day' });
  const rangeQuery = useBookingsRange({ from: range.from, to: range.to, enabled: scope !== 'day' });
  const activeQuery = scope === 'day' ? dayQuery : rangeQuery;

  const rawRows = useMemo(() => activeQuery.data?.bookings ?? [], [activeQuery.data]);

  const searchedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = rawRows;
    if (practitionerFilter) {
      rows = rows.filter(
        (b) => (b.practitioner_id ?? b.calendar_id) === practitionerFilter,
      );
    }
    if (!term) {
      return rows;
    }
    return rows.filter((b) => b.guest_name.toLowerCase().includes(term));
  }, [rawRows, search, practitionerFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const option of STATUS_FILTERS) {
      if (option.key === 'All') continue;
      map[option.key] = searchedRows.filter(option.matches).length;
    }
    return map;
  }, [searchedRows]);

  const filteredRows = useMemo(() => {
    const option = STATUS_FILTERS.find((o) => o.key === status);
    if (!option || option.key === 'All') return searchedRows;
    return searchedRows.filter(option.matches);
  }, [searchedRows, status]);

  const sections = useMemo<BookingSection[]>(() => {
    const byDate = new Map<string, BookingListRow[]>();
    for (const booking of filteredRows) {
      const list = byDate.get(booking.booking_date) ?? [];
      list.push(booking);
      byDate.set(booking.booking_date, list);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        title: formatDayHeading(date),
        data: data.sort((x, y) => (x.booking_time ?? '').localeCompare(y.booking_time ?? '')),
      }));
  }, [filteredRows]);

  const showSectionHeaders = scope !== 'day';

  const label =
    scope === 'day'
      ? formatDayHeading(anchor)
      : scope === 'week'
        ? formatRangeLabel(range.from, range.to)
        : formatMonthLabel(anchor);

  const step = useCallback(
    (direction: -1 | 1) => {
      setAnchor((current) => {
        if (scope === 'week') return addDaysToDateStr(current, direction * 7);
        if (scope === 'month') return addMonthsToDateStr(current, direction);
        return addDaysToDateStr(current, direction);
      });
    },
    [scope],
  );

  const goToday = useCallback(
    () => setAnchor(calendarDateInTimeZone(new Date(), timeZone)),
    [timeZone],
  );

  const openBooking = useCallback(
    (id: string) => router.push(`/booking/${id}` as Href),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: BookingListRow }) => (
      <BookingRow booking={item} isAppointment={isAppointment} onPress={openBooking} />
    ),
    [isAppointment, openBooking],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: BookingSection }) =>
      showSectionHeaders ? (
        <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
          <Text variant="overline" tone="muted">
            {section.title}
          </Text>
        </View>
      ) : null,
    [showSectionHeaders, colors.background],
  );

  return (
    <Screen padded={false}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Segmented value={scope} onChange={setScope} options={SCOPE_OPTIONS} />

        <View style={styles.dateNav}>
          <NavButton dir="left" onPress={() => step(-1)} />
          <Pressable
            onPress={goToday}
            accessibilityRole="button"
            accessibilityHint="Jump to today"
            style={styles.dateLabel}>
            <Text variant="subheading" numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
          <NavButton dir="right" onPress={() => step(1)} />
        </View>

        <Input
          placeholder="Search guest name"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {STATUS_FILTERS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              count={option.key === 'All' ? searchedRows.length : counts[option.key] ?? 0}
              selected={status === option.key}
              onPress={() => setStatus(option.key)}
            />
          ))}
        </ScrollView>

        {/* Staff filter — matches practitioner_id (model B) or calendar_id (unified). */}
        {isAppointment && practitioners.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            <Chip
              label="All staff"
              selected={practitionerFilter === null}
              onPress={() => setPractitionerFilter(null)}
            />
            {practitioners.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                selected={practitionerFilter === p.id}
                onPress={() => setPractitionerFilter((cur) => (cur === p.id ? null : p.id))}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {activeQuery.isLoading ? (
        <View style={styles.listContent}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.skeletonRow, { borderColor: colors.border }]}>
              <Skeleton width={40} height={16} />
              <View style={styles.skeletonMain}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="35%" height={12} />
              </View>
              <Skeleton width={68} height={20} radius={radius.pill} />
            </View>
          ))}
        </View>
      ) : activeQuery.isError ? (
        <ErrorState
          message={
            activeQuery.error instanceof ApiError
              ? activeQuery.error.message
              : activeQuery.error?.message ?? 'Could not load bookings.'
          }
          onRetry={() => void activeQuery.refetch()}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={showSectionHeaders}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            <EmptyState
              title="No appointments"
              message={
                status === 'All'
                  ? 'Nothing booked for this period yet.'
                  : `No ${(STATUS_FILTERS.find((o) => o.key === status)?.label ?? status).toLowerCase()} appointments for this period.`
              }
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={() => void activeQuery.refetch()}
              tintColor={colors.brand}
            />
          }
        />
      )}

      <Fab label={newBookingActionLabel(terminology)} onPress={() => router.push('/booking/new')} />
    </Screen>
  );
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function NavButton({ dir, onPress }: { dir: 'left' | 'right'; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? 'Previous' : 'Next'}
      hitSlop={8}
      style={styles.navButton}>
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
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'] + spacing.xl,
    flexGrow: 1,
  },
  sectionHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  skeletonMain: {
    flex: 1,
    gap: spacing.sm,
  },
});
