import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { apiFetch , ApiError } from '@/lib/api/client';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';

import { BookingDetailSheet } from '@/components/bookings/BookingDetailSheet';
import { BookingSwipeRow } from '@/components/bookings/BookingSwipeRow';
import { BookingStatsBar } from '@/components/bookings/BookingStatsBar';
import { BookingBulkBar } from '@/components/bookings/BookingBulkBar';
import { BookingSortSheet } from '@/components/bookings/BookingSortSheet';
import { BookingServiceFilterSheet } from '@/components/bookings/BookingServiceFilterSheet';
import { BookingDateRangeSheet } from '@/components/bookings/BookingDateRangeSheet';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';

import { newBookingActionLabel } from '@/lib/booking/terminology';
import { inferBookingRowModel } from '@/lib/booking/infer-booking-row-model';
import type { BookingModel } from '@/types/venue';
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
import {
  useComplianceBookingFlags,
  type ComplianceBookingFlag,
} from '@/lib/queries/useCompliance';
import { LiveDot } from '@/components/ui/LiveDot';
import { useBookingsRange } from '@/lib/queries/useBookingsRange';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { isAppointmentFromVenue } from '@/lib/venue/venue-experience';
import { useVenueContext } from '@/providers/VenueProvider';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';
import type { SortKey, SortDir } from '@/components/bookings/BookingSortSheet';

type Scope = 'day' | 'week' | 'month' | 'custom';

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Booking-model filter groups for the type chip row. Practitioner + unified
 * appointments both surface as "Appointment" (mirrors bookingModelShortLabel).
 * `models` lists the inferred BookingModel values a row may carry to match.
 */
type ModelFilterKey = 'appointment' | 'event' | 'class' | 'resource';

const MODEL_FILTERS: { key: ModelFilterKey; label: string; models: BookingModel[] }[] = [
  {
    key: 'appointment',
    label: 'Appointment',
    models: ['practitioner_appointment', 'unified_scheduling'],
  },
  { key: 'event', label: 'Event', models: ['event_ticket'] },
  { key: 'class', label: 'Class', models: ['class_session'] },
  { key: 'resource', label: 'Resource', models: ['resource_booking'] },
];

/** Map an inferred BookingModel to its filter-group key (or null if ungrouped). */
function modelFilterKeyFor(model: BookingModel): ModelFilterKey | null {
  for (const group of MODEL_FILTERS) {
    if (group.models.includes(model)) return group.key;
  }
  return null;
}

/** Parse a HH:mm[:ss] booking_time to an integer hour (0–23), or null. */
function bookingHour(time: string | null | undefined): number | null {
  if (!time) return null;
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : null;
}

/** Preset day time-windows (inclusive start/end hour) for the day view filter. */
const TIME_WINDOWS: { key: string; label: string; start: number; end: number }[] = [
  { key: 'morning', label: 'Morning', start: 0, end: 11 },
  { key: 'afternoon', label: 'Afternoon', start: 12, end: 16 },
  { key: 'evening', label: 'Evening', start: 17, end: 23 },
];

/** Confirmed = explicit status OR either attendance timestamp (web semantics). */
function isAttendanceConfirmed(b: BookingListRow): boolean {
  return (
    b.status === 'Confirmed' ||
    !!b.guest_attendance_confirmed_at ||
    !!b.staff_attendance_confirmed_at
  );
}

/** A booking "needs compliance" when it has a flag whose requirement isn't satisfied. */
function needsCompliance(flag: ComplianceBookingFlag | undefined | null): boolean {
  return !!flag && flag.state !== 'satisfied';
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

/**
 * Flattened list row — date headers are plain rows instead of SectionList
 * sticky sections. SectionList's sticky-header mounting is a known source of
 * Fabric "addViewAt: child already has a parent" native crashes on Android,
 * which made this page unopenable; a flat list avoids that machinery.
 */
type ListRow =
  | { kind: 'header'; date: string; title: string }
  | { kind: 'booking'; booking: BookingListRow };

function rangeFor(scope: Scope, anchor: string, custom: DateRange | null): DateRange {
  if (scope === 'week') {
    const week = getWeekRangeFromDate(anchor);
    return { from: week.from, to: week.to };
  }
  if (scope === 'month') {
    return getMonthRangeFromDate(anchor);
  }
  if (scope === 'custom') {
    // Fall back to the single anchor day until the user picks a range.
    return custom ?? { from: anchor, to: anchor };
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
        cmp = (a.guest_name ?? '').localeCompare(b.guest_name ?? '');
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
  const toast = useToast();
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
    const total = bookings.length;
    if (failed > 0) {
      toast.error(`${total - failed} sent, ${failed} failed.`);
    } else {
      toast.success(`Message sent to ${total} guest${total === 1 ? '' : 's'}.`);
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
  const enabledModels = useMemo(() => venue?.enabled_models ?? [], [venue?.enabled_models]);
  const modelFilterEnabled = enabledModels.length > 0;
  const timeZone = venue?.timezone ?? 'Europe/London';
  const isAppointment = isAppointmentFromVenue(pricingTier, bookingModel);
  const venueId = venue?.id ?? null;

  const [scope, setScope] = useState<Scope>('day');
  const [anchor, setAnchor] = useState<string>(() => calendarDateInTimeZone(new Date(), timeZone));
  // Stable "today" in the venue tz for seeding the custom-range inputs.
  const today = useMemo(() => calendarDateInTimeZone(new Date(), timeZone), [timeZone]);
  const [status, setStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [practitionerFilter, setPractitionerFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<ModelFilterKey | null>(null);
  const [needsComplianceOnly, setNeedsComplianceOnly] = useState(false);
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);

  // --- Custom date range (Custom scope) ---
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);

  // --- Day time-window filter (start/end hour, inclusive) on the day view ---
  const [dayHourRange, setDayHourRange] = useState<{ start: number; end: number } | null>(null);

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

  const range = useMemo(
    () => rangeFor(scope, anchor, customRange),
    [scope, anchor, customRange],
  );

  // Day uses the single-date endpoint (all statuses); week/month/custom use the range endpoint.
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

    // Booking-model type filter — group the inferred model and compare keys.
    if (modelFilter) {
      rows = rows.filter((b) => modelFilterKeyFor(inferBookingRowModel(b)) === modelFilter);
    }

    // Day time-window filter — keep rows whose hour is within [start, end] inclusive.
    if (dayHourRange) {
      rows = rows.filter((b) => {
        const hour = bookingHour(b.booking_time);
        return hour !== null && hour >= dayHourRange.start && hour <= dayHourRange.end;
      });
    }

    // Needs-compliance filter — bookings whose compliance requirement is unmet.
    if (needsComplianceOnly) {
      rows = rows.filter((b) => needsCompliance(complianceFlags?.[b.id]));
    }

    if (!term) {
      return rows;
    }

    // Extended search: name, phone, email, booking item name, booking ID (with/without hyphens).
    return rows.filter((b) => {
      const idNorm = (b.id ?? '').replace(/-/g, '');
      return (
        (b.guest_name ?? '').toLowerCase().includes(term) ||
        (b.guest_phone ?? '').toLowerCase().includes(term) ||
        (b.guest_email ?? '').toLowerCase().includes(term) ||
        (b.booking_item_name ?? '').toLowerCase().includes(term) ||
        (b.id ?? '').toLowerCase().includes(term) ||
        idNorm.includes(term.replace(/-/g, ''))
      );
    });
  }, [
    rawRows,
    search,
    practitionerFilter,
    serviceFilter,
    modelFilter,
    dayHourRange,
    needsComplianceOnly,
    complianceFlags,
  ]);

  // Count of loaded rows needing compliance — drives the chip tally + visibility.
  const complianceNeedsCount = useMemo(() => {
    if (!complianceEnabled || !complianceFlags) return 0;
    return rawRows.reduce(
      (n, b) => (needsCompliance(complianceFlags[b.id]) ? n + 1 : n),
      0,
    );
  }, [complianceEnabled, complianceFlags, rawRows]);

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

  // Per-model tallies for the type chip row — counted before the model filter
  // is applied so each chip shows the full count for its group (web parity).
  const modelChips = useMemo(() => {
    if (!modelFilterEnabled) return [];
    const enabledKeys = new Set(
      enabledModels.map((m) => modelFilterKeyFor(m)).filter((k): k is ModelFilterKey => k !== null),
    );
    const tally: Record<ModelFilterKey, number> = {
      appointment: 0,
      event: 0,
      class: 0,
      resource: 0,
    };
    for (const row of rawRows) {
      const key = modelFilterKeyFor(inferBookingRowModel(row));
      if (key) tally[key] += 1;
    }
    return MODEL_FILTERS.filter((g) => enabledKeys.has(g.key) || tally[g.key] > 0).map((g) => ({
      ...g,
      count: tally[g.key],
    }));
  }, [modelFilterEnabled, enabledModels, rawRows]);

  const showDateHeaders = scope !== 'day';

  const listRows = useMemo<ListRow[]>(() => {
    const byDate = new Map<string, BookingListRow[]>();
    for (const booking of filteredRows) {
      const list = byDate.get(booking.booking_date) ?? [];
      list.push(booking);
      byDate.set(booking.booking_date, list);
    }
    const out: ListRow[] = [];
    for (const [date, data] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (showDateHeaders) {
        out.push({ kind: 'header', date, title: formatDayHeading(date) });
      }
      for (const booking of applySortWithin(data, sortKey, sortDir)) {
        out.push({ kind: 'booking', booking });
      }
    }
    return out;
  }, [filteredRows, sortKey, sortDir, showDateHeaders]);

  const label =
    scope === 'day'
      ? formatDayHeading(anchor)
      : scope === 'week'
        ? formatRangeLabel(range.from, range.to)
        : scope === 'custom'
          ? customRange
            ? formatRangeLabel(customRange.from, customRange.to)
            : 'Pick a date range'
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
    ({ item }: { item: ListRow }) => {
      if (item.kind === 'header') {
        return (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text variant="overline" tone="muted">
              {item.title}
            </Text>
          </View>
        );
      }
      return (
        <Animated.View entering={FadeInDown.duration(180)} layout={LinearTransition.springify()}>
          <BookingSwipeRow
            booking={item.booking}
            isAppointment={isAppointment}
            onPress={openBooking}
            onLongPress={toggleSelect}
            selected={selectedIds.has(item.booking.id)}
            selectionMode={selectionMode}
            complianceFlag={complianceFlags?.[item.booking.id]}
          />
        </Animated.View>
      );
    },
    [
      isAppointment,
      openBooking,
      toggleSelect,
      selectedIds,
      selectionMode,
      complianceFlags,
      colors.background,
    ],
  );

  const isServiceFiltered = serviceFilter !== null;

  // Any non-default list filter active (status chip stays out of scope so the
  // stats bar / chip tallies keep tracking it). Search counts too.
  const anyFilterActive =
    search.trim().length > 0 ||
    practitionerFilter !== null ||
    serviceFilter !== null ||
    modelFilter !== null ||
    dayHourRange !== null ||
    needsComplianceOnly;

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setPractitionerFilter(null);
    setServiceFilter(null);
    setModelFilter(null);
    setDayHourRange(null);
    setNeedsComplianceOnly(false);
  }, []);

  // Custom scope without a chosen range yet — prompt the picker instead of
  // navigating days. Reset the day-window filter when leaving the day scope.
  const handleScopeChange = useCallback((next: Scope) => {
    setScope(next);
    if (next !== 'day') {
      setDayHourRange(null);
    }
    if (next === 'custom') {
      setRangeSheetOpen((wasOpen) => wasOpen || customRange === null);
    }
  }, [customRange]);

  return (
    <Screen padded={false}>
      <ErrorBoundary label="appointments">
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <Segmented value={scope} onChange={handleScopeChange} options={SCOPE_OPTIONS} />

        <View style={styles.dateNav}>
          {/* Custom range has no day-stepping — tap the label to edit the range. */}
          {scope === 'custom' ? null : <NavButton dir="left" onPress={() => step(-1)} />}
          <Pressable
            onPress={scope === 'custom' ? () => setRangeSheetOpen(true) : goToday}
            accessibilityRole="button"
            accessibilityHint={scope === 'custom' ? 'Edit the date range' : 'Jump to today'}
            style={({ pressed }) => [styles.dateLabel, { opacity: pressed ? 0.55 : 1 }]}>
            <View style={styles.dateLabelInner}>
              <Text variant="subheading" numberOfLines={1}>
                {label}
              </Text>
              <LiveDot state={liveState} />
            </View>
          </Pressable>
          {scope === 'custom' ? null : <NavButton dir="right" onPress={() => step(1)} />}
        </View>

        {/* Search + sort/service/walk-in controls — sort & filter live in the SearchBar's trailing slot. */}
        <SearchBar
          placeholder="Search name, phone, email…"
          value={search}
          onChangeText={setSearch}
          right={
            <View style={styles.toolbarIcons}>
              <IconButton
                icon={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }}
                accessibilityLabel="Sort bookings"
                variant="bordered"
                active={sortKey !== 'time'}
                iconSize={18}
                onPress={() => setSortSheetOpen(true)}
              />
              {isAppointment ? (
                <IconButton
                  icon={{
                    ios: 'line.3.horizontal.decrease.circle',
                    android: 'filter_list',
                    web: 'filter_list',
                  }}
                  accessibilityLabel="Filter by service"
                  variant="bordered"
                  active={isServiceFiltered}
                  iconSize={18}
                  onPress={() => setServiceSheetOpen(true)}
                />
              ) : null}
              <IconButton
                icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
                accessibilityLabel="Start a walk-in"
                variant="bordered"
                iconSize={18}
                onPress={() => router.push('/booking/new?intent=walk-in')}
              />
            </View>
          }
        />

        {/* Removable filter chips — service + needs-compliance + clear-all. */}
        {isServiceFiltered || anyFilterActive || (complianceEnabled && complianceNeedsCount > 0) ? (
          <View style={styles.activeFilterRow}>
            {isServiceFiltered ? (
              <Chip
                label="Service"
                selected
                onPress={() => setServiceFilter(null)}
                onRemove={() => setServiceFilter(null)}
              />
            ) : null}
            {complianceEnabled && complianceNeedsCount > 0 ? (
              <Chip
                label="Needs compliance"
                count={complianceNeedsCount}
                selected={needsComplianceOnly}
                selectedColor="#E11D48"
                onPress={() => setNeedsComplianceOnly((v) => !v)}
                onRemove={needsComplianceOnly ? () => setNeedsComplianceOnly(false) : undefined}
              />
            ) : null}
            {anyFilterActive ? (
              <Chip label="Clear all" onPress={clearAllFilters} onRemove={clearAllFilters} />
            ) : null}
          </View>
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

        {/* Booking-model type filter — gated on the venue having enabled models. */}
        {modelChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            <Chip
              label="All types"
              selected={modelFilter === null}
              onPress={() => setModelFilter(null)}
            />
            {modelChips.map((g) => (
              <Chip
                key={g.key}
                label={g.label}
                count={g.count}
                selected={modelFilter === g.key}
                onPress={() => setModelFilter((cur) => (cur === g.key ? null : g.key))}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Day time-window filter — preset hour-bands, day view only. Narrows
            both the list and the stats bar (both derive from searchedRows). */}
        {scope === 'day' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            <Chip
              label="All day"
              selected={dayHourRange === null}
              onPress={() => setDayHourRange(null)}
            />
            {TIME_WINDOWS.map((w) => {
              const active =
                dayHourRange?.start === w.start && dayHourRange?.end === w.end;
              return (
                <Chip
                  key={w.key}
                  label={w.label}
                  selected={active}
                  onPress={() =>
                    setDayHourRange(active ? null : { start: w.start, end: w.end })
                  }
                />
              );
            })}
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
          {/* Stats bar — totals follow the active practitioner/service/search
              filters (web parity); only the status chip is excluded from stats. */}
          {searchedRows.length > 0 ? (
            <View style={[styles.statsBarWrap, { borderBottomColor: colors.border }]}>
              <BookingStatsBar rows={searchedRows} />
            </View>
          ) : null}

          <FlatList
            data={listRows}
            keyExtractor={(item) =>
              item.kind === 'header' ? `header-${item.date}` : item.booking.id
            }
            renderItem={renderItem}
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
                actionLabel={newBookingActionLabel(terminology)}
                onAction={() => router.push('/booking/new')}
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

      {/* Custom date-range sheet */}
      <BookingDateRangeSheet
        visible={rangeSheetOpen}
        onClose={() => setRangeSheetOpen(false)}
        from={customRange?.from ?? null}
        to={customRange?.to ?? null}
        today={today}
        onApply={(r) => {
          setCustomRange(r);
          setScope('custom');
        }}
      />
      </ErrorBoundary>
    </Screen>
  );
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

function NavButton({ dir, onPress }: { dir: 'left' | 'right'; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <IconButton
      icon={
        dir === 'left'
          ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
          : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
      }
      accessibilityLabel={dir === 'left' ? 'Previous' : 'Next'}
      tint={colors.text}
      iconSize={22}
      onPress={onPress}
    />
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
  toolbarIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
