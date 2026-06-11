import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
} from 'react-native';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { apiFetch , ApiError } from '@/lib/api/client';
import { useAccessToken } from '@/lib/queries/useAccessToken';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { BookingRow } from '@/components/bookings/BookingRow';
import { BookingStatsBar } from '@/components/bookings/BookingStatsBar';
import { BookingBulkBar } from '@/components/bookings/BookingBulkBar';
import { BookingSortSheet } from '@/components/bookings/BookingSortSheet';
import { BookingServiceFilterSheet } from '@/components/bookings/BookingServiceFilterSheet';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';

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
import { hapticSelect, hapticError, hapticSuccess } from '@/lib/haptics';
import { useBookingsList } from '@/lib/queries/useBookingsList';
import { useComplianceBookingFlags } from '@/lib/queries/useCompliance';
import { LiveDot } from '@/components/ui/LiveDot';
import { useBookingsRange } from '@/lib/queries/useBookingsRange';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';
import type { SortKey, SortDir } from '@/components/bookings/BookingSortSheet';

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

/** Status filters — order mirrors the web AppointmentBookingsDashboard (Pending is second). */
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

/** Apply the chosen sort within a day's array. */
function applySortWithin(rows: BookingListRow[], sortKey: SortKey, sortDir: SortDir): BookingListRow[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'time':
        cmp = (a.booking_time ?? '').localeCompare(b.booking_time ?? '');
        break;
      case 'client':
        cmp = a.guest_name.localeCompare(b.guest_name);
        break;
      case 'status':
        cmp = (a.status ?? '').localeCompare(b.status ?? '');
        break;
      case 'service':
        cmp = (a.service_variant_name ?? a.booking_item_name ?? '').localeCompare(
          b.service_variant_name ?? b.booking_item_name ?? '',
        );
        break;
      case 'staff':
        cmp = (a.calendar_name ?? '').localeCompare(b.calendar_name ?? '');
        break;
      case 'deposit':
        cmp = (a.deposit_amount_pence ?? 0) - (b.deposit_amount_pence ?? 0);
        break;
      case 'type':
        cmp = (a.booking_model ?? '').localeCompare(b.booking_model ?? '');
        break;
      case 'party_size':
        cmp = (a.party_size ?? 0) - (b.party_size ?? 0);
        break;
    }
    return cmp * dir;
  });
}

/** Bulk message compose sheet — sends one message per selected booking. */
function BulkMessageSheet({
  bookings,
  onClose,
}: {
  bookings: BookingListRow[];
  onClose: () => void;
}) {
  const accessToken = useAccessToken();
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim() || !accessToken) return;
    setSending(true);
    let failed = 0;
    for (const booking of bookings) {
      try {
        await apiFetch(`/api/venue/bookings/${booking.id}/message`, {
          accessToken,
          method: 'POST',
          body: JSON.stringify({ message: message.trim(), channel }),
        });
      } catch {
        failed += 1;
      }
    }
    setSending(false);
    if (failed > 0) {
      hapticError();
      Alert.alert('Partial send', `${bookings.length - failed} sent, ${failed} failed.`);
    } else {
      hapticSuccess();
      Alert.alert('Sent', `Message sent to ${bookings.length} guest${bookings.length === 1 ? '' : 's'}.`);
    }
    onClose();
  }

  return (
    <Sheet visible={bookings.length > 0} onClose={onClose}>
      <Text variant="subheading">Message {bookings.length} guest{bookings.length === 1 ? '' : 's'}</Text>

      <View style={styles.channelRow}>
        {(['email', 'sms', 'both'] as const).map((ch) => (
          <Chip
            key={ch}
            label={ch.charAt(0).toUpperCase() + ch.slice(1)}
            selected={channel === ch}
            onPress={() => setChannel(ch)}
          />
        ))}
      </View>

      <Input
        label="Message"
        placeholder="Type your message…"
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Button
        label={sending ? 'Sending…' : 'Send message'}
        variant="primary"
        fullWidth
        loading={sending}
        disabled={!message.trim() || sending}
        onPress={() => void handleSend()}
      />
      <Button label="Cancel" variant="ghost" fullWidth onPress={onClose} />
    </Sheet>
  );
}

export default function BookingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { venue, terminology, pricingTier, bookingModel, featureFlags } = useVenueContext();
  const complianceEnabled = featureFlags?.resolved?.compliance_records_enabled === true;
  const timeZone = venue?.timezone ?? 'Europe/London';
  const isAppointment = isAppointmentFromVenue(pricingTier, bookingModel);
  const venueId = venue?.id ?? null;

  const [scope, setScope] = useState<Scope>('day');
  const [anchor, setAnchor] = useState<string>(() => calendarDateInTimeZone(new Date(), timeZone));
  const [status, setStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [practitionerFilter, setPractitionerFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);

  // --- Sort state ---
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  // --- Service filter sheet ---
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

  // --- Bulk selection ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMessageBookings, setBulkMessageBookings] = useState<BookingListRow[]>([]);
  const selectionMode = selectedIds.size > 0;

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

  // --- Realtime live sync ---
  const liveState = useVenueLiveSync({
    venueId,
    subscriptions: [{ table: 'bookings', filter: venueId ? `venue_id=eq.${venueId}` : undefined }],
    onRefresh: useCallback(() => void activeQuery.refetch(), [activeQuery]),
    enabled: Boolean(venueId),
  });

  const rawRows = useMemo(() => activeQuery.data?.bookings ?? [], [activeQuery.data]);

  // Per-booking compliance flags — a small dot on each row. Gated on the
  // compliance feature flag; built from all loaded rows for the period.
  const complianceFlagIds = useMemo(
    () => (complianceEnabled ? rawRows.map((r) => r.id) : []),
    [complianceEnabled, rawRows],
  );
  const complianceFlags = useComplianceBookingFlags(complianceFlagIds).data?.flags;

  const searchedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = rawRows;

    if (practitionerFilter) {
      rows = rows.filter(
        (b) => (b.practitioner_id ?? b.calendar_id) === practitionerFilter,
      );
    }

    // Service filter — matches both model types (appointment_service_id or service_item_id).
    if (serviceFilter) {
      rows = rows.filter(
        (b) =>
          b.appointment_service_id === serviceFilter ||
          b.service_item_id === serviceFilter,
      );
    }

    if (!term) {
      return rows;
    }

    // Extended search: name, phone, email, booking item name, booking ID (with/without hyphens).
    return rows.filter((b) => {
      const idNorm = b.id.replace(/-/g, '');
      return (
        b.guest_name.toLowerCase().includes(term) ||
        (b.guest_phone ?? '').toLowerCase().includes(term) ||
        (b.guest_email ?? '').toLowerCase().includes(term) ||
        (b.booking_item_name ?? '').toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term) ||
        idNorm.includes(term.replace(/-/g, ''))
      );
    });
  }, [rawRows, search, practitionerFilter, serviceFilter]);

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
        data: applySortWithin(data, sortKey, sortDir),
      }));
  }, [filteredRows, sortKey, sortDir]);

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

  const openBooking = useCallback((id: string) => setOpenBookingId(id), []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleMessageSelected = useCallback((bookings: BookingListRow[]) => {
    setBulkMessageBookings(bookings);
  }, []);

  const selectedRows = useMemo(
    () => filteredRows.filter((b) => selectedIds.has(b.id)),
    [filteredRows, selectedIds],
  );

  const renderItem = useCallback(
    ({ item }: { item: BookingListRow }) => (
      <BookingRow
        booking={item}
        isAppointment={isAppointment}
        onPress={openBooking}
        onLongPress={toggleSelect}
        selected={selectedIds.has(item.id)}
        selectionMode={selectionMode}
        complianceFlag={complianceFlags?.[item.id]}
      />
    ),
    [isAppointment, openBooking, toggleSelect, selectedIds, selectionMode, complianceFlags],
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

  const isServiceFiltered = serviceFilter !== null;

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
            style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
            <View style={styles.dateLabelInner}>
              <Text variant="subheading" numberOfLines={1}>
                {label}
              </Text>
              <LiveDot state={liveState} />
            </View>
          </Pressable>
          <NavButton dir="right" onPress={() => step(1)} />
        </View>

        {/* Search + sort/service controls row */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Input
              placeholder="Search name, phone, email…"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <View style={styles.toolbarIcons}>
            {/* Sort button */}
            <Pressable
              onPress={() => { hapticSelect(); setSortSheetOpen(true); }}
              hitSlop={8}
              accessibilityLabel="Sort bookings"
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderColor: sortKey !== 'time' ? colors.brand : colors.border,
                  backgroundColor: sortKey !== 'time' ? colors.brandSubtle : colors.surface,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <SymbolView
                name={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }}
                tintColor={sortKey !== 'time' ? colors.brand : colors.textSecondary}
                size={16}
              />
            </Pressable>
            {/* Service filter button */}
            {isAppointment ? (
              <Pressable
                onPress={() => { hapticSelect(); setServiceSheetOpen(true); }}
                hitSlop={8}
                accessibilityLabel="Filter by service"
                style={({ pressed }) => [
                  styles.iconButton,
                  {
                    borderColor: isServiceFiltered ? colors.brand : colors.border,
                    backgroundColor: isServiceFiltered ? colors.brandSubtle : colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <SymbolView
                  name={{ ios: 'line.3.horizontal.decrease.circle', android: 'filter_list', web: 'filter_list' }}
                  tintColor={isServiceFiltered ? colors.brand : colors.textSecondary}
                  size={16}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Active service filter badge */}
        {isServiceFiltered ? (
          <Pressable
            onPress={() => { hapticSelect(); setServiceFilter(null); }}
            style={({ pressed }) => [
              styles.activeFilterBadge,
              { backgroundColor: colors.brandSubtle, borderColor: colors.brand, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text variant="caption" color={colors.brand}>
              Service filter active
            </Text>
            <Text variant="caption" color={colors.brand}>
              ✕
            </Text>
          </Pressable>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {STATUS_FILTERS.map((option) => {
            const count = option.key === 'All' ? searchedRows.length : (counts[option.key] ?? 0);
            return (
              <Chip
                key={option.key}
                label={option.label}
                count={count}
                selected={status === option.key}
                onPress={() => setStatus(option.key)}
              />
            );
          })}
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
        <>
          {/* Stats bar — visible when there are bookings */}
          {rawRows.length > 0 ? (
            <View style={[styles.statsBarWrap, { borderBottomColor: colors.border }]}>
              <BookingStatsBar rows={rawRows} />
            </View>
          ) : null}

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
        </>
      )}

      {/* FAB — hidden during selection mode to prevent accidental taps */}
      {!selectionMode ? (
        <Fab
          accessibilityLabel={newBookingActionLabel(terminology)}
          onPress={() => router.push('/booking/new')}
        />
      ) : null}

      <BookingDetailSheet
        bookingId={openBookingId}
        onClose={() => setOpenBookingId(null)}
      />

      {/* Bulk action tray */}
      <BookingBulkBar
        selected={selectedRows}
        onClear={clearSelection}
        onMessageSelected={handleMessageSelected}
      />

      {/* Bulk message compose sheet */}
      <BulkMessageSheet
        bookings={bulkMessageBookings}
        onClose={() => setBulkMessageBookings([])}
      />

      {/* Sort sheet */}
      <BookingSortSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        sortKey={sortKey}
        sortDir={sortDir}
        onChangeSortKey={setSortKey}
        onToggleSortDir={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
      />

      {/* Service filter sheet */}
      <BookingServiceFilterSheet
        visible={serviceSheetOpen}
        onClose={() => setServiceSheetOpen(false)}
        venueId={venueId}
        selectedServiceId={serviceFilter}
        onSelect={setServiceFilter}
      />
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
      style={({ pressed }) => [styles.navButton, { opacity: pressed ? 0.45 : 1 }]}>
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
  dateLabelInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
  },
  toolbarIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  statsBarWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  channelRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
