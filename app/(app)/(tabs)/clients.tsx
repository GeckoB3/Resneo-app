import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';

import {
  BulkMessageSheet,
  BulkTagSheet,
  MergeContactsSheet,
} from '@/components/clients/BulkActionSheets';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError, apiFetch } from '@/lib/api/client';
import { clientsScreenTitle } from '@/lib/booking/terminology';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useGuests } from '@/lib/queries/useGuests';
import { useGuestTags } from '@/lib/queries/useGuestTags';
import { useVenueContext } from '@/providers/VenueProvider';
import { elevation, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem, GuestListResponse } from '@/types/guest-list';

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SEARCH_LENGTH = 2;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'last_visit_desc', label: 'Recent first' },
  { value: 'last_visit_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'visit_count_desc', label: 'Most visits' },
];

function formatGuestName(guest: GuestListItem): string {
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
        <View
          style={[
            styles.selectCheck,
            {
              borderColor: selected ? colors.brand : colors.borderStrong,
              backgroundColor: selected ? colors.brand : 'transparent',
            },
          ]}>
          {selected ? <Text style={{ color: colors.onBrand, fontSize: 12 }}>✓</Text> : null}
        </View>
      ) : null}
      <Avatar name={name} size={44} />
      <View style={styles.rowText}>
        <Text variant="bodyMedium" numberOfLines={1}>
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
  const { terminology, venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const accessToken = useAccessToken();
  const screenTitle = clientsScreenTitle(terminology);
  const clientLabel = terminology.client.toLowerCase();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('last_visit_desc');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  // Bulk selection (long-press a row to start).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSheet, setBulkSheet] = useState<'tag' | 'message' | 'merge' | null>(null);
  const [exporting, setExporting] = useState(false);
  const selectionMode = selectedIds.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const tagsQuery = useGuestTags();
  const tags = tagsQuery.data?.tags ?? [];

  const guestsQuery = useGuests({
    search: debouncedSearch.length >= MIN_SEARCH_LENGTH ? debouncedSearch : undefined,
    page: 0,
    limit: 50,
    sort,
    segmentTag: tagFilter ?? undefined,
  });

  const openGuest = useCallback(
    (guestId: string) => router.push(`/client/${guestId}` as Href),
    [router],
  );

  // React Compiler memoizes these — manual useCallback here fights it.
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

  const renderItem: ListRenderItem<GuestListItem> = ({ item }) => (
    <GuestRow
      guest={item}
      selectionMode={selectionMode}
      selected={selectedIds.includes(item.id)}
      onPress={() => (selectionMode ? toggleSelected(item.id) : openGuest(item.id))}
      onLongPress={() => toggleSelected(item.id)}
    />
  );

  const guests = useMemo(() => guestsQuery.data?.guests ?? [], [guestsQuery.data]);
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

  return (
    <Screen padded={false}>
      {/* Search box is rendered OUTSIDE the FlatList and the loading/error
          branches, so its TextInput is never remounted while results update —
          the keyboard stays up and you can keep typing. */}
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

        {/* Sort + tag filters (mirrors the web contacts directory). */}
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
        </ScrollView>
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
      </View>

      {guestsQuery.isLoading ? (
        <ListSkeleton avatar rows={7} />
      ) : guestsQuery.isError ? (
        <ErrorState message={errorMessage} onRetry={() => void guestsQuery.refetch()} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={guests}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
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
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}>
          <Text variant="label" style={styles.bulkCount}>
            {selectedIds.length} selected
          </Text>
          {isAdmin ? (
            <Button label="Tag" size="sm" variant="secondary" onPress={() => setBulkSheet('tag')} />
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

      <BulkTagSheet
        guestIds={selectedIds}
        open={bulkSheet === 'tag'}
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
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkBar: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    bottom: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bulkCount: {
    flex: 1,
    paddingLeft: spacing.sm,
  },
});
