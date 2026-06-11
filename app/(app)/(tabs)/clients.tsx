import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BulkMessageSheet,
  BulkRemoveTagSheet,
  BulkTagSheet,
  MergeContactsSheet,
} from '@/components/clients/BulkActionSheets';
import { ContactFilterSheet, type ContactFilterState, DEFAULT_FILTER_STATE } from '@/components/clients/ContactFilterSheet';
import { CreateContactSheet } from '@/components/clients/CreateContactSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Fab } from '@/components/ui/Fab';
import { Input } from '@/components/ui/Input';
import { LiveDot } from '@/components/ui/LiveDot';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiFetch } from '@/lib/api/client';
import { clientsScreenTitle } from '@/lib/booking/terminology';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useGuests } from '@/lib/queries/useGuests';
import { useGuestTags } from '@/lib/queries/useGuestTags';
import { useVenueLiveSync } from '@/lib/realtime/useVenueLiveSync';
import { useVenueContext } from '@/providers/VenueProvider';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem, GuestListResponse } from '@/types/guest-list';

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SEARCH_LENGTH = 2;
const PAGE_SIZE = 50;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'last_visit_desc', label: 'Recent first' },
  { value: 'last_visit_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'visit_count_desc', label: 'Most visits' },
  { value: 'created_desc', label: 'Recently added' },
];

function formatGuestName(guest: GuestListItem): string {
  if (guest.identifiability_tier === 'anonymous') return 'Anonymous guest';
  const parts = [guest.first_name, guest.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed guest';
}

function formatNextBooking(guest: GuestListItem): string | null {
  if (!guest.next_booking_date) {
    return null;
  }
  const time = guest.next_booking_time?.slice(0, 5);
  return time ? `${guest.next_booking_date} · ${time}` : guest.next_booking_date;
}

function GuestRow({
  guest,
  onPress,
  onLongPress,
  selectionMode = false,
  selected = false,
}: {
  guest: GuestListItem;
  onPress: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const name = formatGuestName(guest);
  const visits =
    guest.visit_count > 0 ? `${guest.visit_count} visit${guest.visit_count === 1 ? '' : 's'}` : null;
  const next = formatNextBooking(guest);
  const stats = [visits, next ? `Next: ${next}` : null].filter(Boolean).join(' · ');
  const isAnonymous = guest.identifiability_tier === 'anonymous';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
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
          onPress={onPress}
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
        <Text variant="bodyMedium" numberOfLines={1} tone={isAnonymous ? 'muted' : undefined}>
          {name}
        </Text>
        {guest.phone ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {guest.phone}
          </Text>
        ) : null}
        {guest.email ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {guest.email}
          </Text>
        ) : null}
        {stats ? (
          <Text variant="caption" tone={next ? 'brand' : 'muted'} numberOfLines={1}>
            {stats}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ClientsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { terminology, venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const accessToken = useAccessToken();
  const screenTitle = clientsScreenTitle(terminology);
  const clientLabel = terminology.client.toLowerCase();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('last_visit_desc');
  const [page, setPage] = useState(0);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<ContactFilterState>(DEFAULT_FILTER_STATE);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  // Bulk selection (long-press a row to start).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSheet, setBulkSheet] = useState<'tag' | 'remove_tag' | 'message' | 'merge' | null>(null);
  const [exporting, setExporting] = useState(false);

  const selectionMode = selectedIds.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(0); // reset to first page on new search
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page when filter/sort changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [sort, filterState]);

  const tagsQuery = useGuestTags();
  const tags = tagsQuery.data?.tags ?? [];

  const guestsQuery = useGuests({
    search: debouncedSearch.length >= MIN_SEARCH_LENGTH ? debouncedSearch : undefined,
    page,
    limit: PAGE_SIZE,
    sort,
    // Use filterState segment/tag
    segment: filterState.segment !== 'all' ? filterState.segment : undefined,
    segmentTag: filterState.segment === 'tag' ? filterState.segmentTag : (tagFilter ?? undefined),
    filter: filterState.filter !== 'identified' ? filterState.filter : undefined,
    date_from: filterState.date_from || undefined,
    date_to: filterState.date_to || undefined,
    marketing: filterState.marketing || undefined,
  });

  // Realtime: refresh the directory when the venue's guests change server-side.
  const venueId = venue?.id;
  const liveState = useVenueLiveSync({
    venueId,
    subscriptions: [{ table: 'guests', filter: venueId ? `venue_id=eq.${venueId}` : undefined }],
    onRefresh: useCallback(() => void guestsQuery.refetch(), [guestsQuery]),
    enabled: Boolean(venueId),
  });

  const openGuest = useCallback(
    (guestId: string) => router.push(`/client/${guestId}` as Href),
    [router],
  );

  const toggleSelected = (guestId: string) => {
    setSelectedIds((current) =>
      current.includes(guestId)
        ? current.filter((id) => id !== guestId)
        : [...current, guestId],
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setBulkSheet(null);
  };

  const selectAllOnPage = () => {
    const allIds = guests.map((g) => g.id);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const renderItem: ListRenderItem<GuestListItem> = ({ item }) => (
    <GuestRow
      guest={item}
      selectionMode={selectionMode}
      selected={selectedIds.includes(item.id)}
      onPress={() => (selectionMode ? toggleSelected(item.id) : openGuest(item.id))}
      onLongPress={() => toggleSelected(item.id)}
    />
  );

  const guests = useMemo(() => guestsQuery.data?.guests ?? [], [guestsQuery.data]); // eslint-disable-line react-hooks/preserve-manual-memoization
  const totalCount = guestsQuery.data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const selectedGuests = useMemo(
    () => guests.filter((guest) => selectedIds.includes(guest.id)),
    [guests, selectedIds],
  );

  /** Export the current view (up to 250 contacts) as CSV via the share sheet. */
  const handleExport = useCallback(async () => {
    if (!accessToken) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ page: '0', limit: '250', sort });
      if (debouncedSearch.length >= MIN_SEARCH_LENGTH) params.set('search', debouncedSearch);
      if (tagFilter) {
        params.set('segment', 'tag');
        params.set('segment_tag', tagFilter);
      }
      const data = await apiFetch<GuestListResponse>(`/api/venue/guests?${params.toString()}`, {
        accessToken,
      });
      const esc = (value: string | null | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`;
      const rows = [
        'Name,Email,Phone,Visits,Last visit,Tags',
        ...data.guests.map((g) =>
          [
            esc(formatGuestName(g)),
            esc(g.email),
            esc(g.phone),
            String(g.visit_count ?? 0),
            esc(g.last_visit_date),
            esc((g.tags ?? []).join('; ')),
          ].join(','),
        ),
      ];
      await Share.share({ title: 'Contacts export', message: rows.join('\n') });
    } catch (e) {
      Alert.alert('Export failed', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  }, [accessToken, sort, debouncedSearch, tagFilter]);

  const errorMessage =
    guestsQuery.error instanceof ApiError
      ? guestsQuery.error.message
      : guestsQuery.error?.message ?? 'Could not load clients.';

  // Is the active filter set different from defaults?
  const hasActiveFilter =
    filterState.segment !== 'all' ||
    filterState.filter !== 'identified' ||
    filterState.date_from !== '' ||
    filterState.date_to !== '' ||
    filterState.marketing !== '';

  const bulkBarBottom = Math.max(spacing.base, insets.bottom + spacing.xs);

  return (
    <Screen padded={false}>
      {/* Search box is rendered OUTSIDE the FlatList so its TextInput is never remounted. */}
      <View style={styles.header}>
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchInput}
          placeholder={`Search ${clientLabel}s by name, phone, or email`}
          returnKeyType="search"
          value={searchInput}
        />
        {searchInput.trim().length > 0 && searchInput.trim().length < MIN_SEARCH_LENGTH ? (
          <Text variant="caption" tone="muted">
            Type at least {MIN_SEARCH_LENGTH} characters to search
          </Text>
        ) : null}

        {/* Sort + filter controls */}
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
          <Chip
            label={hasActiveFilter ? 'Filters ●' : 'Filters'}
            selected={hasActiveFilter}
            onPress={() => setFilterSheetOpen(true)}
          />
          {isAdmin ? (
            <Chip
              label={exporting ? 'Exporting…' : 'Export CSV'}
              selected={false}
              onPress={() => void handleExport()}
            />
          ) : null}
        </ScrollView>

        {/* Tag filter chips (legacy quick-filter) */}
        {tags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            keyboardShouldPersistTaps="handled">
            <Chip label="All tags" selected={tagFilter === null} onPress={() => setTagFilter(null)} />
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                selected={tagFilter === tag}
                onPress={() => setTagFilter((cur) => (cur === tag ? null : tag))}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Total count + pagination controls */}
        {!guestsQuery.isLoading && totalCount > 0 ? (
          <View style={styles.pageBar}>
            <View style={styles.countRow}>
              <LiveDot state={liveState} />
              <Text variant="caption" tone="muted">
                {totalCount} {clientLabel}{totalCount === 1 ? '' : 's'} · Page {page + 1} of {totalPages}
              </Text>
            </View>
            <View style={styles.pageButtons}>
              <Button
                label="‹ Prev"
                size="sm"
                variant="ghost"
                disabled={page === 0}
                onPress={() => setPage((p) => Math.max(0, p - 1))}
              />
              <Button
                label="Next ›"
                size="sm"
                variant="ghost"
                disabled={page >= totalPages - 1}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        ) : null}
      </View>

      {guestsQuery.isLoading ? (
        <ListSkeleton avatar rows={7} />
      ) : guestsQuery.isError ? (
        <ErrorState message={errorMessage} onRetry={() => void guestsQuery.refetch()} />
      ) : (
        <FlatList
          contentContainerStyle={[
            styles.listContent,
            selectionMode ? { paddingBottom: 80 + bulkBarBottom } : undefined,
          ]}
          data={guests}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          refreshControl={
            <RefreshControl
              refreshing={guestsQuery.isRefetching}
              onRefresh={() => void guestsQuery.refetch()}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={`No ${screenTitle.toLowerCase()} found`}
              message={
                debouncedSearch.length >= MIN_SEARCH_LENGTH
                  ? `No ${screenTitle.toLowerCase()} match "${debouncedSearch}".`
                  : `Your ${clientLabel} directory will appear here once you have ${clientLabel}s.`
              }
            />
          }
          renderItem={renderItem}
        />
      )}

      {/* Bulk action bar — long-press rows to select. */}
      {selectionMode ? (
        <View
          style={[
            styles.bulkBar,
            elevation.raised,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border, bottom: bulkBarBottom },
          ]}>
          <Text variant="label" style={styles.bulkCount}>
            {selectedIds.length} selected
          </Text>
          <Button
            label={guests.every((g) => selectedIds.includes(g.id)) ? 'Deselect all' : 'Select all'}
            size="sm"
            variant="ghost"
            onPress={selectAllOnPage}
          />
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
          {isAdmin && selectedIds.length >= 2 && selectedIds.length <= 5 ? (
            <Button label="Merge" size="sm" variant="secondary" onPress={() => setBulkSheet('merge')} />
          ) : null}
          <Button label="✕" size="sm" variant="ghost" onPress={clearSelection} />
        </View>
      ) : null}

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
      <MergeContactsSheet
        guests={selectedGuests}
        open={bulkSheet === 'merge'}
        onClose={() => setBulkSheet(null)}
        onDone={clearSelection}
      />

      <ContactFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        value={filterState}
        onApply={(state) => {
          setFilterState(state);
          setTagFilter(null); // clear legacy tag chip when advanced filter applied
        }}
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

function Separator() {
  return <View style={styles.separator} />;
}

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
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  separator: {
    height: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  selectCheck: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkBar: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bulkCount: {
    flex: 1,
    paddingLeft: spacing.sm,
  },
  pageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
