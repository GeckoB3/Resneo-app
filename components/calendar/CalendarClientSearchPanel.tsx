/**
 * The calendar toolbar's contact search (web `OperationsToolbarGuestSearchPanel`
 * on the practitioner calendar): type a name, phone or email, pick the person,
 * then pick one of their bookings to see it on the calendar.
 *
 * The web panel lists matches with Book and View; View opens the contact, whose
 * "Guest bookings" lists upcoming and previous visits, and a visit opens its
 * booking. Here the person's visits open in place (the same Upcoming / Previous
 * split, `splitGuestHistory`), and picking one hands it to the screen, which
 * moves the diary to that day and opens the booking. Book and View sit on the
 * person's step.
 *
 * Drawn inline as a step of the calendar tools sheet, never a Modal of its own
 * ([[ios-no-stacked-modals]]).
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  CLIENT_SEARCH_DEBOUNCE_MS,
  CLIENT_SEARCH_HISTORY_LIMIT,
  CLIENT_SEARCH_MIN_LENGTH,
  clientSearchParams,
  clientSearchResultLabel,
  clientSearchResultSubtitle,
  clientSearchStatus,
  formatClientBookingDate,
} from '@/components/calendar/calendar-client-search';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { SearchBar } from '@/components/ui/SearchBar';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { splitGuestHistory } from '@/lib/guests/guest-history-sections';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useGuests } from '@/lib/queries/useGuests';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';
import type { GuestListItem } from '@/types/guest-list';

type Props = {
  /** The venue's word for a client ("Client", "Guest"...). */
  clientWord: string;
  /** The venue's timezone: decides which visits are still upcoming. */
  timeZone: string;
  onPickBooking: (row: GuestBookingHistoryRow) => void;
  /** Web "Book": a new booking with this person filled in. */
  onBook: (guestId: string) => void;
  /** Web "View": the person's full contact record. */
  onViewContact: (guestId: string) => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message.trim()) return error.message;
  return fallback;
}

export function CalendarClientSearchPanel({
  clientWord,
  timeZone,
  onPickBooking,
  onBook,
  onViewContact,
}: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<GuestListItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), CLIENT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = debouncedQuery.length >= CLIENT_SEARCH_MIN_LENGTH;
  const guestsQuery = useGuests(clientSearchParams(debouncedQuery), { enabled: searching });
  // A disabled query keeps its placeholder rows, so a cleared box would still
  // list the last matches: only a live search shows any.
  const results = searching && !guestsQuery.isError ? guestsQuery.data?.guests ?? [] : [];
  const loading = searching && guestsQuery.isFetching;
  const hasError = searching && guestsQuery.isError;
  const status = clientSearchStatus({
    query,
    debouncedQuery,
    loading,
    hasError,
    resultCount: results.length,
  });
  const clientLower = clientWord.toLowerCase();

  if (selected) {
    return (
      <ClientBookingsStep
        row={selected}
        timeZone={timeZone}
        onBack={() => setSelected(null)}
        onPickBooking={onPickBooking}
        onBook={onBook}
        onViewContact={onViewContact}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Name, phone, or email"
        accessibilityLabel={`Search ${clientLower}`}
        autoFocus
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.results}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <View accessibilityLiveRegion="polite" style={styles.statusBlock}>
          {status.showHint ? (
            <Text variant="caption" tone="muted">
              {`Type at least ${CLIENT_SEARCH_MIN_LENGTH} characters…`}
            </Text>
          ) : null}
          {loading ? (
            <View style={styles.inline}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text variant="caption" tone="muted">
                Searching…
              </Text>
            </View>
          ) : null}
          {hasError ? (
            <Text variant="caption" tone="danger">
              {errorMessage(guestsQuery.error, 'Search failed')}
            </Text>
          ) : null}
          {status.showEmpty ? (
            <Text variant="caption" tone="muted">
              {`No ${clientLower}s match that search.`}
            </Text>
          ) : null}
        </View>
        {results.map((row) => (
          <ResultRow key={row.id} row={row} onPress={() => setSelected(row)} />
        ))}
      </ScrollView>
    </View>
  );
}

function ResultRow({ row, onPress }: { row: GuestListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const label = clientSearchResultLabel(row);
  const subtitle = clientSearchResultSubtitle(row);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${subtitle}`}
      accessibilityHint="Shows their bookings"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surface : colors.surfaceRaised,
        },
      ]}>
      <Avatar name={label} size={36} />
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function ClientBookingsStep({
  row,
  timeZone,
  onBack,
  onPickBooking,
  onBook,
  onViewContact,
}: {
  row: GuestListItem;
  timeZone: string;
  onBack: () => void;
  onPickBooking: (row: GuestBookingHistoryRow) => void;
  onBook: (guestId: string) => void;
  onViewContact: (guestId: string) => void;
}) {
  const detailQuery = useGuestDetail(row.id, { bookingHistoryLimit: CLIENT_SEARCH_HISTORY_LIMIT });
  const history = detailQuery.data?.booking_history;
  const sections = useMemo(
    () => splitGuestHistory(history ?? [], new Date(), timeZone),
    [history, timeZone],
  );
  const label = clientSearchResultLabel(row);

  return (
    <View style={styles.flex}>
      <View style={styles.personHeader}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          accessibilityLabel="Back to results"
          onPress={onBack}
        />
        <View style={styles.flex}>
          <Text variant="label" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {clientSearchResultSubtitle(row)}
          </Text>
        </View>
        <Button label="Book" size="sm" variant="secondary" onPress={() => onBook(row.id)} />
        <Button label="View" size="sm" variant="ghost" onPress={() => onViewContact(row.id)} />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.results}>
        {detailQuery.isLoading ? (
          <Text variant="caption" tone="muted">
            Loading…
          </Text>
        ) : detailQuery.isError ? (
          <Text variant="caption" tone="danger">
            {errorMessage(detailQuery.error, 'Failed to load contact')}
          </Text>
        ) : (
          <>
            <BookingGroup title="Upcoming" rows={sections.upcoming} onPick={onPickBooking} />
            <BookingGroup title="Previous" rows={sections.previous} onPick={onPickBooking} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function BookingGroup({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: GuestBookingHistoryRow[];
  onPick: (row: GuestBookingHistoryRow) => void;
}) {
  return (
    <View style={styles.group}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text variant="caption" tone="muted">
          None
        </Text>
      ) : (
        rows.map((booking) => <BookingRow key={booking.id} booking={booking} onPress={() => onPick(booking)} />)
      )}
    </View>
  );
}

function BookingRow({ booking, onPress }: { booking: GuestBookingHistoryRow; onPress: () => void }) {
  const { colors } = useTheme();
  const date = formatClientBookingDate(booking.booking_date);
  const time = booking.booking_time ? booking.booking_time.slice(0, 5) : '';
  const when = time ? `${date} · ${time}` : date;
  const what = booking.service_name?.trim() || booking.detail_label?.trim() || 'No service';
  const who = booking.practitioner_name?.trim() || booking.area_name?.trim() || null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${when}, ${what}${who ? `, ${who}` : ''}`}
      accessibilityHint="Shows this booking on the calendar"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surface : colors.surfaceRaised,
        },
      ]}>
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {when}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {who ? `${what} · ${who}` : what}
        </Text>
      </View>
      <StatusPill
        status={booking.status}
        isTableReservation={booking.booking_model === 'table_reservation'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  results: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  statusBlock: {
    gap: spacing.xs,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  group: {
    gap: spacing.sm,
  },
});
