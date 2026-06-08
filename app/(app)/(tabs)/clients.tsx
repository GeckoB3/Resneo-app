import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { clientsScreenTitle } from '@/lib/booking/terminology';
import { useGuests } from '@/lib/queries/useGuests';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestListItem } from '@/types/guest-list';

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SEARCH_LENGTH = 2;

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

function GuestRow({ guest, onPress }: { guest: GuestListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const name = formatGuestName(guest);
  const visits =
    guest.visit_count > 0 ? `${guest.visit_count} visit${guest.visit_count === 1 ? '' : 's'}` : null;
  const next = formatNextBooking(guest);
  const stats = [visits, next ? `Next: ${next}` : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
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
  const { terminology } = useVenueContext();
  const screenTitle = clientsScreenTitle(terminology);
  const clientLabel = terminology.client.toLowerCase();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const guestsQuery = useGuests({
    search: debouncedSearch.length >= MIN_SEARCH_LENGTH ? debouncedSearch : undefined,
    page: 0,
    limit: 50,
  });

  const openGuest = useCallback(
    (guestId: string) => router.push(`/client/${guestId}` as Href),
    [router],
  );

  const renderItem: ListRenderItem<GuestListItem> = useCallback(
    ({ item }) => <GuestRow guest={item} onPress={() => openGuest(item.id)} />,
    [openGuest],
  );

  const guests = guestsQuery.data?.guests ?? [];
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
});
