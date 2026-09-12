/**
 * ClientsTab — the Reports → Clients directory: search, the web's Show / Sort /
 * tag filters, expandable rows with inline edit, GDPR erase, and the guest
 * history CSV.
 *
 * The controls and the figures on each row follow the web's list
 * (_reference/Resneo/src/app/dashboard/reports/ClientsSection.tsx): the same
 * identity scope (default "With contact"), the same six sorts, a tag filter you
 * can stack, and phone / visit count / no-show count on every row.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { GuestTagEditor } from '@/components/clients/GuestTagEditor';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatGuestDisplayName } from '@/lib/guests/name';
import { hapticTap, hapticWarning } from '@/lib/haptics';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useGuests } from '@/lib/queries/useGuests';
import { useGuestTags } from '@/lib/queries/useGuestTags';
import { useUpdateGuest, useEraseGuest } from '@/lib/queries/useGuestMutations';
import { formatPence } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';
import { CONFIRM_ARM_MS } from '@/lib/ui/confirm-arm';

const PAGE_SIZE = 25;

/** Identity scope — the web's "Show" select (ClientsSection.tsx:345-357). */
type IdentityFilter = 'identified' | 'all' | 'anonymous';

const FILTER_OPTIONS: { value: IdentityFilter; label: string }[] = [
  { value: 'identified', label: 'With contact (CRM)' },
  { value: 'all', label: 'All except walk-ins' },
  { value: 'anonymous', label: 'Walk-ins only' },
];

/** The web's sorts, in its order (ClientsSection.tsx:24-31). */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'last_visit_desc', label: 'Last visit (newest)' },
  { value: 'last_visit_asc', label: 'Last visit (oldest)' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'visit_count_desc', label: 'Most visits' },
  { value: 'created_desc', label: 'Recently added' },
];

/**
 * The web's display name, with its anonymous rule. The name itself comes from
 * the shared port of web `lib/guests/name.ts`, so this list and a bulk-message
 * summary cannot drift apart on what a contact is called.
 */
function guestDisplayName(guest: GuestListItem, filter: IdentityFilter): string {
  if (filter === 'anonymous' || guest.identifiability_tier === 'anonymous') return 'Anonymous';
  return formatGuestDisplayName(guest.first_name, guest.last_name);
}

// ─── Guest row ───────────────────────────────────────────────────────────────

function GuestRow({
  guest,
  onPress,
  isExpanded,
  filter,
  totalBookingsLabel,
  visitsLabel,
}: {
  guest: GuestListItem;
  onPress: () => void;
  isExpanded: boolean;
  filter: IdentityFilter;
  totalBookingsLabel: string;
  visitsLabel: string;
}) {
  const { colors } = useTheme();
  const isAnonymous = filter === 'anonymous' || guest.identifiability_tier === 'anonymous';
  const fullName = guestDisplayName(guest, filter);

  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      style={[
        styles.guestRow,
        { borderColor: colors.border },
        isExpanded && { backgroundColor: colors.brandSubtle },
      ]}>
      <View style={styles.guestMain}>
        <View style={styles.guestNameRow}>
          <Text
            variant="bodyMedium"
            tone={isAnonymous ? 'muted' : 'default'}
            numberOfLines={1}
            style={[styles.guestName, isAnonymous ? styles.anonymousName : null]}>
            {fullName}
          </Text>
          <Text variant="caption" style={{ color: isExpanded ? colors.brand : colors.textMuted }}>
            {isExpanded ? '▲' : '▼'}
          </Text>
        </View>
        {/* Email and phone, both shown as the web's columns do. */}
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {`${guest.email ?? '-'} · ${guest.phone ?? '-'}`}
        </Text>
        <View style={styles.guestMeta}>
          <Text variant="caption" tone="secondary">
            {`${totalBookingsLabel}: ${guest.total_bookings}`}
          </Text>
          <Text variant="caption" tone="secondary">
            {`${visitsLabel}: ${guest.visit_count}`}
          </Text>
          {guest.no_show_count > 0 ? (
            <Text variant="caption" style={{ color: colors.danger }}>
              {`${guest.no_show_count} NS`}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {`Last visit: ${guest.last_visit_date ?? '-'}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Expanded guest detail ───────────────────────────────────────────────────

function GuestDetail({
  guestId,
  onErased,
  bookingWord,
}: {
  guestId: string;
  onErased: () => void;
  bookingWord: string;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const detailQuery = useGuestDetail(guestId, { bookingHistoryLimit: 20 });
  const updateMutation = useUpdateGuest(guestId);
  const eraseMutation = useEraseGuest();

  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Two-step erase confirm — Alert.alert confirms never fire on web.
  const [eraseArmed, setEraseArmed] = useState(false);
  const eraseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (eraseTimer.current) clearTimeout(eraseTimer.current);
    },
    [],
  );

  const guest = detailQuery.data?.guest;
  const stats = detailQuery.data?.stats;
  const history = detailQuery.data?.booking_history ?? [];

  // Initialise edit fields from the fetched guest
  const initEdit = useCallback(() => {
    if (!guest) return;
    setFirstName(guest.first_name ?? '');
    setLastName(guest.last_name ?? '');
    setEmail(guest.email ?? '');
    setPhone(guest.phone ?? '');
    setEditing(true);
  }, [guest]);

  async function handleSave() {
    hapticTap();
    try {
      await updateMutation.mutateAsync({
        first_name: firstName ?? undefined,
        last_name: lastName ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
      });
      setEditing(false);
      toast.success('Guest profile updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save guest.';
      toast.error(msg);
    }
  }

  async function runErase() {
    if (eraseTimer.current) clearTimeout(eraseTimer.current);
    setEraseArmed(false);
    try {
      await eraseMutation.mutateAsync({ guestId });
      toast.success('Guest data has been erased.');
      onErased();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erase failed.';
      toast.error(msg);
    }
  }

  function handleErasePress() {
    if (eraseArmed) {
      void runErase();
      return;
    }
    setEraseArmed(true);
    hapticWarning();
    if (eraseTimer.current) clearTimeout(eraseTimer.current);
    eraseTimer.current = setTimeout(() => setEraseArmed(false), CONFIRM_ARM_MS);
  }

  async function handleExportHistory() {
    if (history.length === 0) {
      toast.info('No booking history for this guest.');
      return;
    }
    // The web's columns, in its order, and its filename
    // (ClientsSection.tsx:205-218) — deposit is the deposit STATUS.
    const rows: string[][] = [
      ['Date', 'Time', 'Service', 'Covers', 'Status', 'Deposit', 'Practitioner'],
      ...history.map((row) => [
        row.booking_date,
        row.booking_time,
        row.service_name ?? '-',
        String(row.party_size ?? '-'),
        row.status,
        row.deposit_status ?? '-',
        row.practitioner_name ?? '-',
      ]),
    ];
    const result = await buildAndShareCsv(`guest-${guestId}-bookings.csv`, rows);
    if (!result.ok) {
      toast.error('Could not export the report.');
      return;
    }
    toast.success('Export started.');
  }

  if (detailQuery.isLoading) {
    return (
      <View style={styles.detailLoading}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (detailQuery.isError || !guest) {
    return (
      <Text variant="caption" tone="muted" style={styles.detailError}>
        {detailQuery.error instanceof ApiError
          ? detailQuery.error.message
          : 'Could not load guest details.'}
      </Text>
    );
  }

  return (
    <View style={[styles.guestDetail, { borderColor: colors.border }]}>
      {/* Stats */}
      {stats ? (
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {stats.total_bookings}
            </Text>
            <Text variant="caption" tone="muted">
              Bookings
            </Text>
          </View>
          <View style={styles.statTile}>
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'], color: colors.warning }}>
              {stats.no_shows}
            </Text>
            <Text variant="caption" tone="muted">
              No-shows
            </Text>
          </View>
          <View style={styles.statTile}>
            <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
              {stats.cancellations}
            </Text>
            <Text variant="caption" tone="muted">
              Cancelled
            </Text>
          </View>
          {stats.total_deposit_pence_paid > 0 ? (
            <View style={styles.statTile}>
              <Text
                variant="heading"
                style={{ fontVariant: ['tabular-nums'], color: colors.success }}>
                {formatPence(stats.total_deposit_pence_paid)}
              </Text>
              <Text variant="caption" tone="muted">
                Paid
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Editable fields */}
      {editing ? (
        <View style={styles.editFields}>
          <View style={styles.editRow}>
            <View style={styles.editHalf}>
              <Input
                label="First name"
                value={firstName ?? ''}
                onChangeText={setFirstName}
              />
            </View>
            <View style={styles.editHalf}>
              <Input
                label="Last name"
                value={lastName ?? ''}
                onChangeText={setLastName}
              />
            </View>
          </View>
          <Input
            label="Email"
            value={email ?? ''}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Phone"
            value={phone ?? ''}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              onPress={() => setEditing(false)}
            />
            <Button
              label={updateMutation.isPending ? 'Saving...' : 'Save'}
              variant="primary"
              size="sm"
              loading={updateMutation.isPending}
              onPress={() => void handleSave()}
            />
          </View>
        </View>
      ) : (
        <View style={styles.profileRow}>
          <View style={styles.profileInfo}>
            {guest.email ? (
              <Text variant="bodySmall" tone="secondary">
                {guest.email}
              </Text>
            ) : null}
            {guest.phone ? (
              <Text variant="bodySmall" tone="secondary">
                {guest.phone}
              </Text>
            ) : null}
          </View>
          <Button label="Edit" variant="ghost" size="sm" onPress={initEdit} />
        </View>
      )}

      {/* Tags — inline add/remove with a typeahead from the venue's tags */}
      <GuestTagEditor
        tags={guest.tags}
        onTagsChange={(next) => updateMutation.mutateAsync({ tags: next })}
        disabled={updateMutation.isPending}
      />

      {/* Recent booking history */}
      {history.length > 0 ? (
        <View style={styles.historySection}>
          <Text variant="label" tone="secondary">
            {`Recent ${bookingWord.toLowerCase()}s`}
          </Text>
          {history.slice(0, 5).map((row) => (
            <View
              key={row.id}
              style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text variant="bodySmall">
                  {row.booking_date} {row.booking_time}
                </Text>
                <Text variant="caption" tone="muted">
                  {row.service_name ?? row.detail_label ?? row.kind_label}
                  {row.practitioner_name ? ` · ${row.practitioner_name}` : ''}
                </Text>
              </View>
              <Text
                variant="caption"
                style={{
                  color:
                    row.status === 'Completed'
                      ? colors.success
                      : row.status === 'Cancelled'
                        ? colors.danger
                        : colors.textSecondary,
                }}>
                {row.status}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Button
          label="Export history (CSV)"
          variant="secondary"
          size="sm"
          onPress={() => void handleExportHistory()}
        />
        <Button
          label={eraseArmed ? 'Tap to confirm erase' : 'Erase data'}
          variant="danger"
          size="sm"
          loading={eraseMutation.isPending}
          onPress={handleErasePress}
        />
      </View>
    </View>
  );
}

// ─── ClientsTab (public) ─────────────────────────────────────────────────────

export function ClientsTab({
  clientWord = 'Client',
  bookingWord = 'Booking',
  isAppointment = false,
}: {
  /** The venue's word for a client (terminology.client). */
  clientWord?: string;
  /** The venue's word for a booking (terminology.booking). */
  bookingWord?: string;
  /** Appointment venues label the lifecycle count with their booking word. */
  isAppointment?: boolean;
} = {}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<IdentityFilter>('identified');
  const [sort, setSort] = useState('last_visit_desc');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const tagsQuery = useGuestTags();
  const venueTags = tagsQuery.data?.tags ?? [];

  const clientLower = clientWord.toLowerCase();
  const totalBookingsLabel = `Total ${bookingWord.toLowerCase()}s`;
  const visitsLabel = isAppointment ? `${bookingWord}s (lifecycle)` : 'Visit count';

  const guestsQuery = useGuests({
    search: debouncedSearch,
    page,
    limit: PAGE_SIZE,
    sort,
    // The identity scope always goes on the wire, as the web sends it, so the
    // list never depends on the route's default (ClientsSection.tsx:108-113).
    filter,
    ...(tagFilter.length > 0 ? { tags: tagFilter } : {}),
  });

  function handleSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(text);
      setPage(0);
      setExpandedId(null);
    }, 400);
  }

  /** Any control that changes the result set sends the list back to page one. */
  function resetPage() {
    setPage(0);
    setExpandedId(null);
  }

  function handleFilterPress(next: IdentityFilter) {
    hapticTap();
    setFilter(next);
    resetPage();
  }

  function handleSortPress(next: string) {
    hapticTap();
    setSort(next);
    resetPage();
  }

  function handleTagPress(tag: string) {
    hapticTap();
    // Tags stack: tapping one adds it, tapping it again drops it (web parity).
    setTagFilter((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
    resetPage();
  }

  const guests = guestsQuery.data?.guests ?? [];
  const total = guestsQuery.data?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMore = guests.length + page * PAGE_SIZE < total;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <SearchBar
        value={search}
        onChangeText={handleSearchChange}
        onClear={() => handleSearchChange('')}
        placeholder="Name, email, or phone"
        containerStyle={styles.searchBar}
      />

      {/* Show — the identity scope (web's "Show" select) */}
      <Text variant="overline" tone="muted">
        Show
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={filter === option.value}
            onPress={() => handleFilterPress(option.value)}
          />
        ))}
      </ScrollView>

      {/* Sort */}
      <Text variant="overline" tone="muted">
        Sort
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={sort === option.value}
            onPress={() => handleSortPress(option.value)}
          />
        ))}
      </ScrollView>

      {/* Tag filter chips (venue tags) — more than one can be on at once */}
      {venueTags.length > 0 ? (
        <>
          <Text variant="overline" tone="muted">
            Filter by tags
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}>
            {venueTags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                selected={tagFilter.includes(tag)}
                onPress={() => handleTagPress(tag)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Loading state */}
      {guestsQuery.isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator />
        </View>
      ) : guestsQuery.isError ? (
        <ErrorState
          message={
            guestsQuery.error instanceof ApiError
              ? guestsQuery.error.message
              : 'Could not load guests.'
          }
          onRetry={() => void guestsQuery.refetch()}
        />
      ) : guests.length === 0 ? (
        <EmptyState
          title={`No matching ${clientLower}s`}
          message={`No ${clientLower} match this list. Try another filter or search.`}
        />
      ) : (
        <>
          <Text variant="caption" tone="muted" style={styles.totalLabel}>
            {`Page ${page + 1} of ${totalPages} (${total} total)`}
          </Text>

          {guests.map((guest) => (
            <View key={guest.id}>
              <GuestRow
                guest={guest}
                filter={filter}
                totalBookingsLabel={totalBookingsLabel}
                visitsLabel={visitsLabel}
                isExpanded={expandedId === guest.id}
                onPress={() => setExpandedId(expandedId === guest.id ? null : guest.id)}
              />
              {expandedId === guest.id ? (
                <GuestDetail
                  guestId={guest.id}
                  bookingWord={bookingWord}
                  onErased={() => {
                    setExpandedId(null);
                    void guestsQuery.refetch();
                  }}
                />
              ) : null}
            </View>
          ))}

          {/* Pagination */}
          <View style={styles.pagination}>
            {page > 0 ? (
              <Button
                label="Previous"
                variant="secondary"
                size="sm"
                onPress={() => {
                  hapticTap();
                  setPage((p) => Math.max(0, p - 1));
                  setExpandedId(null);
                }}
              />
            ) : null}
            {hasMore ? (
              <Button
                label={guestsQuery.isFetching ? 'Loading...' : 'Next page'}
                variant="secondary"
                size="sm"
                loading={guestsQuery.isFetching}
                onPress={() => {
                  hapticTap();
                  setPage((p) => p + 1);
                  setExpandedId(null);
                }}
              />
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  searchBar: {
    marginBottom: spacing.xs,
  },
  totalLabel: {
    marginBottom: spacing.xs,
  },
  centred: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  guestMain: {
    flex: 1,
    gap: 2,
  },
  guestNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guestName: {
    flex: 1,
  },
  anonymousName: {
    fontStyle: 'italic',
  },
  guestMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 2,
  },
  guestDetail: {
    padding: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  detailLoading: {
    padding: spacing.md,
    alignItems: 'center',
  },
  detailError: {
    padding: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
  },
  editFields: {
    gap: spacing.sm,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editHalf: {
    flex: 1,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileInfo: {
    gap: spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  historySection: {
    gap: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingTop: spacing.base,
  },
});
