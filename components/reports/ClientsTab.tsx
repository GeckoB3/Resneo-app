/**
 * ClientsTab — searchable, paginated guest directory with expandable detail,
 * inline edit, GDPR erase, and CSV history export.
 *
 * Lives inside the Reports screen under the "Clients" sub-tab.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticTap, hapticWarning } from '@/lib/haptics';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useGuests } from '@/lib/queries/useGuests';
import { useUpdateGuest, useEraseGuest } from '@/lib/queries/useGuestMutations';
import { formatPence } from '@/lib/format';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';

const PAGE_SIZE = 25;

// ─── Guest row ───────────────────────────────────────────────────────────────

function GuestRow({
  guest,
  onPress,
  isExpanded,
}: {
  guest: GuestListItem;
  onPress: () => void;
  isExpanded: boolean;
}) {
  const { colors } = useTheme();
  const fullName = [guest.first_name, guest.last_name].filter(Boolean).join(' ') || 'Anonymous';

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
        <Text variant="bodyMedium">{fullName}</Text>
        {guest.email ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {guest.email}
          </Text>
        ) : null}
      </View>
      <View style={styles.guestStats}>
        <Text variant="caption" tone="secondary">
          {guest.total_bookings} booking{guest.total_bookings === 1 ? '' : 's'}
        </Text>
        {guest.last_visit_date ? (
          <Text variant="caption" tone="muted">
            Last: {guest.last_visit_date}
          </Text>
        ) : null}
      </View>
      <Text
        variant="caption"
        style={{ color: isExpanded ? colors.brand : colors.textMuted }}>
        {isExpanded ? '▲' : '▼'}
      </Text>
    </Pressable>
  );
}

// ─── Expanded guest detail ───────────────────────────────────────────────────

function GuestDetail({ guestId, onErased }: { guestId: string; onErased: () => void }) {
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
    eraseTimer.current = setTimeout(() => setEraseArmed(false), 4000);
  }

  async function handleExportHistory() {
    if (history.length === 0) {
      toast.info('No booking history for this guest.');
      return;
    }
    const rows: string[][] = [
      ['Date', 'Time', 'Service', 'Practitioner', 'Status', 'Deposit'],
      ...history.map((row) => [
        row.booking_date,
        row.booking_time,
        row.service_name ?? row.detail_label ?? '',
        row.practitioner_name ?? '',
        row.status,
        row.deposit_amount_pence != null ? formatPence(row.deposit_amount_pence) ?? '' : '',
      ]),
    ];
    const name = [guest?.first_name, guest?.last_name].filter(Boolean).join('-') || guestId;
    await buildAndShareCsv(`guest-history-${name}.csv`, rows);
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

      {/* Tags */}
      {guest.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {guest.tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tagChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="caption" tone="secondary">
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Recent booking history */}
      {history.length > 0 ? (
        <View style={styles.historySection}>
          <Text variant="label" tone="secondary">
            Recent bookings
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
          label="Export history"
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

export function ClientsTab() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const guestsQuery = useGuests({
    search: debouncedSearch,
    page,
    limit: PAGE_SIZE,
    sort: 'last_visit_desc',
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

  const guests = guestsQuery.data?.guests ?? [];
  const total = guestsQuery.data?.total_count ?? 0;
  const hasMore = guests.length + page * PAGE_SIZE < total;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <SearchBar
        value={search}
        onChangeText={handleSearchChange}
        onClear={() => handleSearchChange('')}
        placeholder="Search by name, email or phone…"
        containerStyle={styles.searchBar}
      />

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
          title={debouncedSearch ? 'No guests match your search' : 'No guests yet'}
          message={
            debouncedSearch
              ? 'Try a different name or email.'
              : 'Guests appear here once they have a booking.'
          }
        />
      ) : (
        <>
          <Text variant="caption" tone="muted" style={styles.totalLabel}>
            {total} guest{total === 1 ? '' : 's'} total
          </Text>

          {guests.map((guest) => (
            <View key={guest.id}>
              <GuestRow
                guest={guest}
                isExpanded={expandedId === guest.id}
                onPress={() => setExpandedId(expandedId === guest.id ? null : guest.id)}
              />
              {expandedId === guest.id ? (
                <GuestDetail
                  guestId={guest.id}
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
  },
  guestStats: {
    alignItems: 'flex-end',
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
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
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
