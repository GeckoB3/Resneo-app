import { format, parseISO } from 'date-fns';
import * as ExpoLinking from 'expo-linking';
import { type Href, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useReduceMotion, motionSafe, layoutSafe } from '@/lib/motion';

import {
  BulkMessageSheet,
  BulkRemoveTagSheet,
  BulkTagSheet,
} from '@/components/clients/BulkActionSheets';
import { ContactAzRail } from '@/components/clients/ContactAzRail';
import { ContactFilterSheet, type ContactFilterState, DEFAULT_FILTER_STATE } from '@/components/clients/ContactFilterSheet';
import { ContactLetterHeader } from '@/components/clients/ContactLetterHeader';
import { flattenContacts, isNameSort } from '@/components/clients/contactListData';
import { CreateContactSheet } from '@/components/clients/CreateContactSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { BulkActionBar, BULK_ACTION_BAR_CLEARANCE } from '@/components/ui/BulkActionBar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { IconButton } from '@/components/ui/IconButton';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { SearchBar } from '@/components/ui/SearchBar';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { SwipeRow, type SwipeAction } from '@/components/ui/SwipeRow';
import { Text } from '@/components/ui/Text';
import { ApiError, apiFetch } from '@/lib/api/client';
import { getWebUrl } from '@/lib/env';
import { clientsScreenTitle } from '@/lib/booking/terminology';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useGuestCustomFields, useGuests } from '@/lib/queries/useGuests';
import { useGuestTags } from '@/lib/queries/useGuestTags';
import { queryKeys } from '@/lib/queries/keys';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { isUnifiedSchedulingVenue } from '@/lib/venue/venue-experience';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  ContactCustomFieldDefinition,
  ContactListRow,
  GuestListItem,
  GuestListResponse,
} from '@/types/guest-list';

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SEARCH_LENGTH = 2;
const PAGE_SIZE = 50;
const MAX_ROW_TAGS = 3;
/** Hard ceiling on exported rows so a runaway directory can't hang the share sheet. */
const EXPORT_MAX_ROWS = 5000;
const EXPORT_PAGE_SIZE = 250;
/** Mirror useGuestDetail's default booking-history limit so the prefetch key matches. */
const DETAIL_BOOKING_HISTORY_LIMIT = 80;

/**
 * Web Data-import hub path. The CSV/Excel import wizard is desktop-grade and a
 * deliberate v1 scope exclusion on mobile (Domain 05) — the Contacts tab surfaces
 * a discoverable link-out to it (admin-only) rather than porting the wizard.
 * Exported for the import link-out test.
 */
export const WEB_IMPORT_PATH = '/dashboard/import';

/** Resolve a staff-dashboard URL on the configured WEB origin (prod fallback). */
export function webDashboardUrl(path: string): string {
  const base = getWebUrl();
  return base ? `${base}${path}` : `https://app.resneo.com${path}`;
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'last_visit_desc', label: 'Recent first' },
  { value: 'last_visit_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'visit_count_desc', label: 'Most visits' },
  { value: 'created_desc', label: 'Recently added' },
];

const SEGMENT_LABELS: Record<string, string> = {
  new: 'New this period',
  upcoming: 'Upcoming visit',
  visit: 'By last visit',
  marketing: 'Marketing consent',
  last_staff: 'By last staff',
  last_service: 'By last service',
  tag: 'By tag',
};

const IDENTITY_LABELS: Record<string, string> = {
  all: 'All contacts',
  anonymous: 'Anonymous only',
};

const MARKETING_LABELS: Record<string, string> = {
  subscribed: 'Subscribed',
  not_subscribed: 'Not subscribed',
};

function formatGuestName(guest: GuestListItem): string {
  if (guest.identifiability_tier === 'anonymous') return 'Anonymous guest';
  const parts = [guest.first_name, guest.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

/** Compact "d MMM" calendar date, or the raw string if it won't parse. */
function shortDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM');
  } catch {
    return dateStr;
  }
}

function formatNextBooking(guest: GuestListItem): string | null {
  if (!guest.next_booking_date) return null;
  const time = guest.next_booking_time?.slice(0, 5);
  const date = shortDate(guest.next_booking_date);
  return time ? `${date} · ${time}` : date;
}

/** Serialise a custom-field value into a single CSV cell. */
function customFieldCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function GuestRowBase({
  guest,
  onPress,
  onPressIn,
  onLongPress,
  selectionMode = false,
  selected = false,
}: {
  guest: GuestListItem;
  onPress: (id: string) => void;
  onPressIn?: (id: string) => void;
  onLongPress?: (id: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const name = formatGuestName(guest);
  const isAnonymous = guest.identifiability_tier === 'anonymous';
  const visits =
    guest.visit_count > 0 ? `${guest.visit_count} visit${guest.visit_count === 1 ? '' : 's'}` : null;
  const next = formatNextBooking(guest);
  const lastVisit = guest.last_visit_date ? `Last: ${shortDate(guest.last_visit_date)}` : null;
  // Prefer the forward-looking "Next" pill; fall back to last visit.
  const visitPill = next ? `Next: ${next}` : lastVisit;
  const tags = guest.tags ?? [];
  const shownTags = tags.slice(0, MAX_ROW_TAGS);
  const overflowTags = tags.length - shownTags.length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onPress(guest.id)}
      onPressIn={onPressIn ? () => onPressIn(guest.id) : undefined}
      onLongPress={onLongPress ? () => onLongPress(guest.id) : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: selected ? colors.brand : colors.border,
          borderWidth: selected ? 1 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {selectionMode ? (
        <Pressable
          hitSlop={10}
          onPress={() => onPress(guest.id)}
          style={[
            styles.selectCheck,
            {
              borderColor: selected ? colors.brand : colors.borderStrong,
              backgroundColor: selected ? colors.brand : 'transparent',
            },
          ]}>
          {selected ? <Text style={{ color: colors.onBrand, fontSize: 12 }}>✓</Text> : null}
        </Pressable>
      ) : null}
      <Avatar name={name} size={44} />
      <View style={styles.rowText}>
        <View style={styles.rowTitleRow}>
          <Text
            variant="bodyMedium"
            numberOfLines={1}
            tone={isAnonymous ? 'muted' : undefined}
            style={styles.rowName}>
            {name}
          </Text>
          {guest.no_show_count > 0 ? (
            <Badge label={`${guest.no_show_count} no-show${guest.no_show_count === 1 ? '' : 's'}`} tone="warning" />
          ) : null}
        </View>
        {guest.phone ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {guest.phone}
          </Text>
        ) : guest.email ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {guest.email}
          </Text>
        ) : null}

        {/* Tag chips (max 3 + overflow) */}
        {shownTags.length > 0 ? (
          <View style={styles.rowTags}>
            {shownTags.map((tag) => (
              <Badge key={tag} label={tag} tone="brand" />
            ))}
            {overflowTags > 0 ? <Badge label={`+${overflowTags}`} tone="neutral" /> : null}
          </View>
        ) : null}

        {/* Visit / next-booking line */}
        {visits || visitPill ? (
          <Text variant="caption" tone={next ? 'brand' : 'muted'} numberOfLines={1}>
            {[visits, visitPill].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Memoized so rows skip re-render while scrolling / selecting unrelated rows. */
const GuestRow = memo(GuestRowBase);

export default function ClientsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const toast = useToast();
  const { terminology, venue, bookingModel } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const accessToken = useAccessToken();
  const screenTitle = clientsScreenTitle(terminology);
  const clientLabel = terminology.client.toLowerCase();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('last_visit_desc');
  const [page, setPage] = useState(0);
  // Accumulated rows across the pages fetched so far (infinite scroll).
  const [loadedGuests, setLoadedGuests] = useState<GuestListItem[]>([]);
  const [filterState, setFilterState] = useState<ContactFilterState>(DEFAULT_FILTER_STATE);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  // Bulk selection (long-press a row to start).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSheet, setBulkSheet] = useState<'tag' | 'remove_tag' | 'message' | null>(null);
  const [exporting, setExporting] = useState(false);
  // Measured bulk-bar height — grows when its actions wrap to a second row.
  const [bulkBarClearance, setBulkBarClearance] = useState(BULK_ACTION_BAR_CLEARANCE);

  const listRef = useRef<FlatList<ContactListRow>>(null);

  const selectionMode = selectedIds.length > 0;
  const nameSort = isNameSort(sort);

  // last_service_kind mirrors the web: 'service_item' for unified venues,
  // 'appointment_service' otherwise. Without it the RPC returns zero rows.
  const lastServiceKind: 'service_item' | 'appointment_service' = isUnifiedSchedulingVenue(
    bookingModel,
  )
    ? 'service_item'
    : 'appointment_service';

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const tagsQuery = useGuestTags();
  const tags = tagsQuery.data?.tags ?? [];

  // Shared param source for the list query AND the CSV export, so export always
  // matches exactly what's on screen.
  const guestQueryParams = useMemo(
    () => ({
      search: debouncedSearch.length >= MIN_SEARCH_LENGTH ? debouncedSearch : undefined,
      sort,
      segment: filterState.segment !== 'all' ? filterState.segment : undefined,
      segmentTag: filterState.segment === 'tag' ? filterState.segmentTag : undefined,
      filter: filterState.filter !== 'identified' ? filterState.filter : undefined,
      date_from: filterState.date_from || undefined,
      date_to: filterState.date_to || undefined,
      marketing: filterState.marketing || undefined,
      last_staff_id: filterState.segment === 'last_staff' ? filterState.last_staff_id : undefined,
      last_service_id:
        filterState.segment === 'last_service' ? filterState.last_service_id : undefined,
      last_service_kind:
        filterState.segment === 'last_service' ? lastServiceKind : undefined,
    }),
    [debouncedSearch, sort, filterState, lastServiceKind],
  );

  // A stable identity for the active query params. Whenever it changes (sort,
  // search, any filter facet) we reset infinite-scroll accumulation to page 0.
  const queryParamsKey = useMemo(() => JSON.stringify(guestQueryParams), [guestQueryParams]);

  // Reset pagination + the accumulated rows whenever the query params change.
  // Also clear any bulk selection: the selected ids may no longer be in the
  // new result set, so bulk-acting on them after a filter/search/sort change
  // would target contacts that no longer match the view.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
    setLoadedGuests([]);
    setSelectedIds([]);
    setBulkSheet(null);
  }, [queryParamsKey]);

  const guestsQuery = useGuests({ ...guestQueryParams, page, limit: PAGE_SIZE });

  const totalCount = guestsQuery.data?.total_count ?? 0;
  const responsePage = guestsQuery.data?.page;
  const responseGuests = guestsQuery.data?.guests;

  // Append each freshly-loaded page into the accumulator, de-duplicating by id.
  // We only merge when the response's echoed page matches the page we asked for,
  // so keepPreviousData's stale frames during a transition don't double-append.
  useEffect(() => {
    if (!responseGuests || responsePage == null || responsePage !== page) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedGuests((current) => {
      if (page === 0) return responseGuests;
      const seen = new Set(current.map((g) => g.id));
      const additions = responseGuests.filter((g) => !seen.has(g.id));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  }, [responseGuests, responsePage, page]);

  const guests = loadedGuests;
  const hasMore = guests.length < totalCount;
  const isFetchingNextPage = page > 0 && guestsQuery.isFetching;

  const loadNextPage = useCallback(() => {
    if (guestsQuery.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [guestsQuery.isFetching, hasMore]);

  // Realtime: refresh the directory when the venue's guests OR bookings change
  // server-side. Web watches both tables so a new/changed booking refreshes the
  // contact's next-visit + stats (last_visit, visit_count, upcoming count).
  // Mirrors `page` for the live-sync callback, which must stay referentially
  // stable (useVenueLiveSync keys its subscription on identity) and therefore
  // cannot close over the state directly.
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const venueId = venue?.id;
  const venueFilter = venueId ? `venue_id=eq.${venueId}` : undefined;
  const liveState = useVenueLiveSync({
    venueId,
    subscriptions: [
      { table: 'guests', filter: venueFilter },
      { table: 'bookings', filter: venueFilter },
    ],
    onRefresh: useCallback(() => {
      // Refetch in place. Resetting to page 0 unconditionally threw anyone who
      // had scrolled back to the top: the accumulator REPLACES its list when
      // page is 0, so a directory scrolled to row ~180 collapsed to the first
      // 25 and the scroll position was clamped. This subscription watches
      // `bookings` as well as `guests`, filtered only by venue, so on a busy day
      // an online booking or a colleague's status tap fired it every few seconds
      // — mid-search.
      //
      // Page 0 still refetches (it is the active query), and deeper pages are
      // left as they are: a new contact appears on the next manual pull, which
      // is a far smaller surprise than losing your place.
      if (pageRef.current === 0) void guestsQuery.refetch();
    }, [guestsQuery]),
    enabled: Boolean(venueId),
  });

  const openGuest = useCallback(
    (guestId: string) => router.push(`/client/${guestId}` as Href),
    [router],
  );

  // Open the web Data-import hub in an in-app browser tab (system-browser
  // fallback). Admin-gated at the call sites. The native CSV importer is out of
  // scope for v1 (Domain 05) — this is the discoverable link-out from Contacts.
  const openImport = useCallback(() => {
    const url = webDashboardUrl(WEB_IMPORT_PATH);
    void WebBrowser.openBrowserAsync(url).catch(() =>
      ExpoLinking.openURL(url).catch(() =>
        toast.error('Could not open the import tool. Please try again.'),
      ),
    );
  }, [toast]);

  // Warm the detail cache on press-in so the detail screen paints instantly.
  const prefetchGuest = useCallback(
    (guestId: string) => {
      if (!accessToken) return;
      void queryClient.prefetchQuery({
        queryKey: queryKeys.guests.detail(accessToken, guestId, DETAIL_BOOKING_HISTORY_LIMIT),
        queryFn: () => {
          const params = new URLSearchParams({
            booking_history_limit: String(DETAIL_BOOKING_HISTORY_LIMIT),
          });
          return apiFetch(`/api/venue/guests/${guestId}?${params.toString()}`, { accessToken });
        },
        staleTime: 30_000,
      });
    },
    [accessToken, queryClient],
  );

  const toggleSelected = useCallback((guestId: string) => {
    setSelectedIds((current) =>
      current.includes(guestId)
        ? current.filter((id) => id !== guestId)
        : [...current, guestId],
    );
  }, []);

  const clearSelection = () => {
    setSelectedIds([]);
    setBulkSheet(null);
  };

  const selectAllOnPage = () => {
    const allIds = guests.map((g) => g.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  };

  // Flatten loaded rows into header + contact rows for the A–Z list. For
  // non-name sorts we still flatten (without headers) so renderItem is uniform.
  const { rows, stickyHeaderIndices, letterIndex } = useMemo(() => {
    if (nameSort) return flattenContacts(guests);
    return {
      rows: guests.map<ContactListRow>((guest) => ({
        type: 'contact' as const,
        guest,
        key: guest.id,
      })),
      stickyHeaderIndices: [] as number[],
      letterIndex: new Map<string, number>(),
    };
  }, [guests, nameSort]);

  const presentLetters = useMemo(() => new Set(letterIndex.keys()), [letterIndex]);

  // Jump the list to a letter's sticky header (A–Z rail). viewPosition 0 pins
  // the header to the top; scrollToIndex needs getItemLayout (provided below).
  const jumpToLetter = useCallback(
    (letter: string) => {
      const index = letterIndex.get(letter);
      if (index == null) return;
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
    },
    [letterIndex],
  );

  // Stable id-based row handlers — identity only changes when selectionMode
  // flips, so memoized rows skip re-render while scrolling and while selecting
  // other rows. (toggleSelected/openGuest/prefetchGuest are themselves stable.)
  const handleRowPress = useCallback(
    (id: string) => (selectionMode ? toggleSelected(id) : openGuest(id)),
    [selectionMode, toggleSelected, openGuest],
  );
  const handleRowPressIn = useCallback(
    (id: string) => {
      if (!selectionMode) prefetchGuest(id);
    },
    [selectionMode, prefetchGuest],
  );

  const renderContactRow = useCallback(
    (item: GuestListItem) => {
      const swipeActions: SwipeAction[] = [];
      if (item.phone) {
        swipeActions.push({
          key: 'call',
          label: 'Call',
          icon: { ios: 'phone.fill', android: 'call', web: 'call' },
          color: colors.success,
          onPress: () => void Linking.openURL(`tel:${item.phone}`),
        });
        swipeActions.push({
          key: 'message',
          label: 'Text',
          icon: { ios: 'message.fill', android: 'sms', web: 'sms' },
          color: colors.brand,
          onPress: () => void Linking.openURL(`sms:${item.phone}`),
        });
      }

      const row = (
        <GuestRow
          guest={item}
          selectionMode={selectionMode}
          selected={selectedIds.includes(item.id)}
          onPress={handleRowPress}
          onPressIn={handleRowPressIn}
          onLongPress={toggleSelected}
        />
      );

      return (
        <Animated.View
          entering={motionSafe(FadeInDown.duration(180), reduceMotion)}
          layout={layoutSafe(LinearTransition.springify(), reduceMotion)}>
          {/* Swipe quick-actions are iOS-feel only; disabled in selection mode. */}
          {!selectionMode && swipeActions.length > 0 ? (
            <SwipeRow rightActions={swipeActions}>{row}</SwipeRow>
          ) : (
            row
          )}
        </Animated.View>
      );
    },
    [
      colors.brand,
      colors.success,
      selectionMode,
      selectedIds,
      handleRowPress,
      handleRowPressIn,
      toggleSelected,
      reduceMotion,
    ],
  );

  const renderItem: ListRenderItem<ContactListRow> = useCallback(
    ({ item }) =>
      item.type === 'header' ? (
        <ContactLetterHeader letter={item.letter} />
      ) : (
        renderContactRow(item.guest)
      ),
    [renderContactRow],
  );

  // Precomputed cumulative offsets so getItemLayout is O(1) (not O(n) per call).
  // Heights are approximate — rows are variable-height — which is fine: it only
  // needs to put the A–Z rail's scrollToIndex jump in the right neighbourhood,
  // and onScrollToIndexFailed is the safety net for not-yet-rendered targets.
  const rowOffsets = useMemo(() => {
    const offsets = new Array<number>(rows.length);
    let running = 0;
    for (let i = 0; i < rows.length; i += 1) {
      offsets[i] = running;
      running += rows[i].type === 'header' ? HEADER_ROW_HEIGHT : CONTACT_ROW_HEIGHT;
    }
    return offsets;
  }, [rows]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<ContactListRow> | null | undefined, index: number) => {
      const length = rows[index]?.type === 'header' ? HEADER_ROW_HEIGHT : CONTACT_ROW_HEIGHT;
      return { index, length, offset: rowOffsets[index] ?? 0 };
    },
    [rows, rowOffsets],
  );

  const keyExtractor = useCallback((item: ContactListRow) => item.key, []);

  /**
   * Export every contact in the CURRENT view as CSV, paging through results.
   * Params come from the same source as the list query, so the export honours
   * the active segment, identity scope, date range, marketing and search.
   * Columns mirror the web ContactsDashboard export (split name, booking
   * signals, marketing flags, plus a column per active custom field).
   */
  const customFieldsQuery = useGuestCustomFields();
  const handleExport = useCallback(async () => {
    // Guard re-entry: ignore taps while an export is already running.
    if (!accessToken || exporting) return;
    setExporting(true);
    try {
      // Fetch the active custom-field definitions so we can add a column each.
      let activeFields: ContactCustomFieldDefinition[] = [];
      try {
        const cf =
          customFieldsQuery.data ?? (await customFieldsQuery.refetch()).data ?? { fields: [] };
        activeFields = (cf.fields ?? []).filter((f) => f.is_active);
      } catch {
        // Non-fatal: export the core columns without custom fields.
        activeFields = [];
      }

      const all: GuestListItem[] = [];
      let exportPage = 0;
      let truncated = false;
      for (;;) {
        const params = new URLSearchParams({
          page: String(exportPage),
          limit: String(EXPORT_PAGE_SIZE),
          sort: guestQueryParams.sort,
          include_custom_fields: '1',
        });
        if (guestQueryParams.search) params.set('search', guestQueryParams.search);
        if (guestQueryParams.filter) params.set('filter', guestQueryParams.filter);
        if (guestQueryParams.segment) params.set('segment', guestQueryParams.segment);
        if (guestQueryParams.segmentTag) params.set('segment_tag', guestQueryParams.segmentTag);
        if (guestQueryParams.date_from) params.set('date_from', guestQueryParams.date_from);
        if (guestQueryParams.date_to) params.set('date_to', guestQueryParams.date_to);
        if (guestQueryParams.segment === 'marketing' && guestQueryParams.marketing) {
          params.set('marketing', guestQueryParams.marketing);
        }
        if (guestQueryParams.last_staff_id) params.set('last_staff_id', guestQueryParams.last_staff_id);
        if (guestQueryParams.last_service_id) {
          params.set('last_service_id', guestQueryParams.last_service_id);
          if (guestQueryParams.last_service_kind) {
            params.set('last_service_kind', guestQueryParams.last_service_kind);
          }
        }
        const data = await apiFetch<GuestListResponse>(`/api/venue/guests?${params.toString()}`, {
          accessToken,
        });
        const batch = data.guests ?? [];
        all.push(...batch);
        const reachedEnd = batch.length < EXPORT_PAGE_SIZE;
        if (all.length >= EXPORT_MAX_ROWS) {
          truncated = !reachedEnd;
          break;
        }
        if (reachedEnd) break;
        exportPage += 1;
      }

      const esc = (value: string | null | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`;
      const header = [
        'First name',
        'Surname',
        'Email',
        'Phone',
        'Tags',
        'Visits',
        'No-shows',
        'Last visit',
        'Total bookings',
        'Upcoming',
        'Cancelled',
        'Paid deposits (£)',
        'Marketing consent',
        'Marketing opt-out',
        ...activeFields.map((f) => `CF: ${f.field_name}`),
      ]
        .map(esc)
        .join(',');

      // Build up to EXPORT_MAX_ROWS rows in chunks, yielding to the event loop
      // between batches so a large directory export never blocks the UI thread
      // long enough to freeze scrolling or drop the share-sheet animation (W9.4).
      const exportRows = all.slice(0, EXPORT_MAX_ROWS);
      const lines: string[] = [header];
      const CHUNK = 500;
      for (let i = 0; i < exportRows.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, exportRows.length);
        for (let j = i; j < end; j += 1) {
          const g = exportRows[j];
          const cf = g.custom_fields ?? {};
          lines.push(
            [
              esc(g.first_name),
              esc(g.last_name),
              esc(g.email),
              esc(g.phone),
              esc((g.tags ?? []).join('; ')),
              String(g.visit_count ?? 0),
              String(g.no_show_count ?? 0),
              esc(g.last_visit_date),
              String(g.total_bookings ?? 0),
              String(g.upcoming_booking_count ?? 0),
              String(g.cancelled_count ?? 0),
              ((g.paid_deposit_pence ?? 0) / 100).toFixed(2),
              g.marketing_consent ? 'yes' : 'no',
              g.marketing_opt_out ? 'yes' : 'no',
              ...activeFields.map((f) => esc(customFieldCell(cf[f.field_key]))),
            ].join(','),
          );
        }
        if (end < exportRows.length) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }

      // Lines were built in yielding chunks above; the final join of the
      // pre-built strings is cheap. Share via the file/Blob/share helper.
      const csvText = lines.join('\n');
      const result = await buildAndShareCsv('contacts-export.csv', [], csvText);

      if (!result.ok) {
        // W2.7: the web Blob-download / share failure is now surfaced here via
        // the toast host instead of being swallowed with a bare console.error.
        toast.error('Could not export contacts. Please try again.');
        return;
      }
      if (truncated) {
        toast.info(`Export capped at ${EXPORT_MAX_ROWS} contacts.`);
      } else {
        toast.success('Contacts export ready.');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not export contacts.');
    } finally {
      setExporting(false);
    }
  }, [accessToken, exporting, customFieldsQuery, guestQueryParams, toast]);

  const errorMessage =
    guestsQuery.error instanceof ApiError
      ? guestsQuery.error.message
      : guestsQuery.error?.message ?? 'Could not load clients.';

  // Active filter facets → removable summary chips (web parity).
  const filterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filterState.segment !== 'all') {
      const segLabel = SEGMENT_LABELS[filterState.segment] ?? filterState.segment;
      const tagSuffix =
        filterState.segment === 'tag' && filterState.segmentTag ? `: ${filterState.segmentTag}` : '';
      chips.push({
        key: 'segment',
        label: `${segLabel}${tagSuffix}`,
        clear: () =>
          setFilterState((s) => ({
            ...s,
            segment: 'all',
            segmentTag: '',
            date_from: '',
            date_to: '',
            marketing: '',
            last_staff_id: '',
            last_service_id: '',
          })),
      });
    }
    if (filterState.filter !== 'identified') {
      chips.push({
        key: 'identity',
        label: IDENTITY_LABELS[filterState.filter] ?? filterState.filter,
        clear: () => setFilterState((s) => ({ ...s, filter: 'identified' })),
      });
    }
    if (filterState.segment === 'marketing' && filterState.marketing) {
      chips.push({
        key: 'marketing',
        label: MARKETING_LABELS[filterState.marketing] ?? filterState.marketing,
        clear: () => setFilterState((s) => ({ ...s, marketing: 'subscribed' })),
      });
    }
    if (filterState.date_from || filterState.date_to) {
      const from = filterState.date_from || '…';
      const to = filterState.date_to || '…';
      chips.push({
        key: 'dates',
        label: `${from} → ${to}`,
        clear: () => setFilterState((s) => ({ ...s, date_from: '', date_to: '' })),
      });
    }
    if (debouncedSearch.length >= MIN_SEARCH_LENGTH) {
      chips.push({
        key: 'search',
        label: `“${debouncedSearch}”`,
        clear: () => setSearchInput(''),
      });
    }
    return chips;
  }, [filterState, debouncedSearch]);

  const hasActiveFilter =
    filterState.segment !== 'all' ||
    filterState.filter !== 'identified' ||
    filterState.date_from !== '' ||
    filterState.date_to !== '';

  // Keep the A–Z rail clear of the floating bulk bar when it's showing.
  const railBottomInset = selectionMode ? bulkBarClearance : spacing.xl;

  const listFooter = useMemo(() => {
    if (guests.length === 0) return null;
    if (isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={colors.brand} />
        </View>
      );
    }
    if (!hasMore) {
      return (
        <View style={styles.footer}>
          <Text variant="caption" tone="muted">
            All {totalCount} {clientLabel}{totalCount === 1 ? '' : 's'} loaded
          </Text>
        </View>
      );
    }
    return null;
  }, [guests.length, isFetchingNextPage, hasMore, totalCount, clientLabel, colors.brand]);

  return (
    <Screen padded={false} bottomInset={false}>
      {/* Search box is rendered OUTSIDE the FlatList so its TextInput is never remounted. */}
      <View style={styles.header}>
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder={`Search ${clientLabel}s by name, phone, or email`}
          right={
            <IconButton
              icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
              accessibilityLabel="Filter contacts"
              variant="bordered"
              active={hasActiveFilter}
              onPress={() => setFilterSheetOpen(true)}
            />
          }
        />
        {searchInput.trim().length > 0 && searchInput.trim().length < MIN_SEARCH_LENGTH ? (
          <Text variant="caption" tone="muted">
            Type at least {MIN_SEARCH_LENGTH} characters to search
          </Text>
        ) : null}

        {/* Sort controls */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled">
          {SORT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={sort === option.value}
              onPress={() => setSort(option.value)}
            />
          ))}
          {isAdmin ? (
            <Chip
              label={exporting ? 'Exporting…' : 'Export CSV'}
              selected={false}
              onPress={() => void handleExport()}
            />
          ) : null}
          {isAdmin ? (
            <Chip label="Import contacts" selected={false} onPress={openImport} />
          ) : null}
        </ScrollView>

        {/* Active filter summary — removable chips */}
        {filterChips.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            keyboardShouldPersistTaps="handled">
            {filterChips.map((chip) => (
              <Chip key={chip.key} label={chip.label} selected onRemove={chip.clear} />
            ))}
          </ScrollView>
        ) : null}

        {/* Total count + live indicator */}
        {!guestsQuery.isLoading && totalCount > 0 ? (
          <View style={styles.countRow}>
            <LiveDot state={liveState} />
            <Text variant="caption" tone="muted">
              {guests.length} of {totalCount} {clientLabel}{totalCount === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
      </View>

      {guestsQuery.isLoading && guests.length === 0 ? (
        <ListSkeleton avatar rows={7} />
      ) : guestsQuery.isError && guests.length === 0 ? (
        <ErrorState message={errorMessage} onRetry={() => void guestsQuery.refetch()} />
      ) : (
        <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            contentContainerStyle={[
              styles.listContent,
              selectionMode ? { paddingBottom: bulkBarClearance } : undefined,
            ]}
            data={rows}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            getItemLayout={getItemLayout}
            stickyHeaderIndices={nameSort ? stickyHeaderIndices : undefined}
            onEndReached={loadNextPage}
            onEndReachedThreshold={0.6}
            // W8.4 virtualization tuning — paired with getItemLayout above.
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
            // scrollToIndex can briefly miss before all rows render; fall back to
            // an offset scroll then retry so the A–Z rail never throws.
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
            }}
            refreshControl={
              <RefreshControl
                refreshing={guestsQuery.isRefetching && page === 0}
                onRefresh={() => {
                  setPage(0);
                  void guestsQuery.refetch();
                }}
                tintColor={colors.brand}
              />
            }
            ListEmptyComponent={
              <EmptyState
                illustration={
                  debouncedSearch.length >= MIN_SEARCH_LENGTH || hasActiveFilter
                    ? 'search'
                    : 'clients'
                }
                title={`No ${screenTitle.toLowerCase()} found`}
                message={
                  debouncedSearch.length >= MIN_SEARCH_LENGTH
                    ? `No ${screenTitle.toLowerCase()} match "${debouncedSearch}".`
                    : `Your ${clientLabel} directory will appear here once you have ${clientLabel}s. You can import them from a CSV export of your previous system.`
                }
                // Surface the import link-out where admins discover an empty
                // directory — but only when nothing is being searched/filtered
                // (an empty *search* result shouldn't suggest importing).
                actionLabel={
                  isAdmin && debouncedSearch.length < MIN_SEARCH_LENGTH && !hasActiveFilter
                    ? 'Import contacts'
                    : undefined
                }
                onAction={
                  isAdmin && debouncedSearch.length < MIN_SEARCH_LENGTH && !hasActiveFilter
                    ? openImport
                    : undefined
                }
              />
            }
            ListFooterComponent={listFooter}
            renderItem={renderItem}
          />

          {/* Right-edge A–Z jump rail — only for name sorts with loaded letters. */}
          {nameSort && presentLetters.size > 1 ? (
            <ContactAzRail
              presentLetters={presentLetters}
              onJump={jumpToLetter}
              bottomInset={railBottomInset}
            />
          ) : null}
        </View>
      )}

      {/* Bulk action bar — long-press rows to select. */}
      <BulkActionBar
        count={selectedIds.length}
        allSelected={guests.length > 0 && guests.every((g) => selectedIds.includes(g.id))}
        onToggleSelectAll={selectAllOnPage}
        onClear={clearSelection}
        onHeightChange={setBulkBarClearance}>
        {isAdmin ? (
          <Button label="Tag" size="sm" variant="secondary" onPress={() => setBulkSheet('tag')} />
        ) : null}
        {isAdmin ? (
          <Button
            label="Remove tag"
            size="sm"
            variant="secondary"
            onPress={() => setBulkSheet('remove_tag')}
          />
        ) : null}
        {isAdmin ? (
          <Button
            label="Message"
            size="sm"
            variant="secondary"
            onPress={() => setBulkSheet('message')}
          />
        ) : null}
      </BulkActionBar>

      {/* FAB — create new contact */}
      {!selectionMode ? (
        <Fab
          accessibilityLabel={`New ${clientLabel}`}
          onPress={() => setCreateSheetOpen(true)}
        />
      ) : null}

      <BulkTagSheet
        guestIds={selectedIds}
        open={bulkSheet === 'tag'}
        onClose={() => setBulkSheet(null)}
        onDone={clearSelection}
      />
      <BulkRemoveTagSheet
        guestIds={selectedIds}
        open={bulkSheet === 'remove_tag'}
        onClose={() => setBulkSheet(null)}
        onDone={clearSelection}
      />
      <BulkMessageSheet
        guestIds={selectedIds}
        open={bulkSheet === 'message'}
        onClose={() => setBulkSheet(null)}
        onDone={clearSelection}
      />

      <ContactFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        value={filterState}
        onApply={setFilterState}
        availableTags={tags}
      />

      <CreateContactSheet
        visible={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onCreated={(guestId) => {
          setCreateSheetOpen(false);
          router.push(`/client/${guestId}` as Href);
        }}
        clientNoun={clientLabel}
      />
    </Screen>
  );
}

/** Approximate row heights so the A–Z rail's scrollToIndex lands accurately. */
const HEADER_ROW_HEIGHT = 32;
const CONTACT_ROW_HEIGHT = 84;

const styles = StyleSheet.create({
  header: {
    padding: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
  },
  rowTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  selectCheck: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
