import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { ListSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { useClassRoster, type ClassSession } from '@/lib/queries/useClassSchedule';
import { buildAndShareCsv } from '@/lib/reports/csv-export';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type ClassRosterViewProps = {
  session: ClassSession;
  /** Resolved instructor/calendar column name, when known. */
  instructorName?: string | null;
  onBack: () => void;
  /** Open the booking command-centre (BookingDetailSheet) for an attendee. */
  onOpenBooking: (bookingId: string) => void;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
};

function formatDeposit(row: BookingListRow, currency: string): string | null {
  if (row.deposit_amount_pence == null || row.deposit_amount_pence <= 0) return null;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const amount = `${symbol}${(row.deposit_amount_pence / 100).toFixed(2)}`;
  return row.deposit_status ? `${amount} deposit (${row.deposit_status})` : `${amount} deposit`;
}

/** "14:03" style local time, or null for missing/invalid timestamps. */
function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatArrived(iso: string | null | undefined): string | null {
  const time = formatTime(iso);
  return time ? `Arrived ${time}` : null;
}

function formatCheckedIn(iso: string | null | undefined): string | null {
  const time = formatTime(iso);
  return time ? `Checked in ${time}` : null;
}

/**
 * Roster for one class session — attendees with status, contact and deposit
 * info, sourced from the Bearer-capable
 * GET /api/venue/bookings/list?class_instance_id=… Tapping an attendee opens
 * the existing booking detail sheet, where status / attendance / cancel
 * actions already work over Bearer routes.
 *
 * Class-specific roster actions (check in, no-show with course sync, check in
 * all, cancel the session) use cookie-only API routes, so they stay on the web
 * dashboard — noted inline below the list.
 */
export function ClassRosterView({
  session,
  instructorName,
  onBack,
  onOpenBooking,
}: ClassRosterViewProps) {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const toast = useToast();
  const currency = venue?.currency ?? 'GBP';
  const query = useClassRoster(session.classInstanceId);

  const attendees = useMemo(() => query.data?.bookings ?? [], [query.data]);

  const onExport = useCallback(async () => {
    if (attendees.length === 0) {
      toast.info('No attendees to export yet.');
      return;
    }
    try {
      const header = ['Guest', 'Status', 'Party size', 'Checked in', 'Arrived', 'Phone', 'Email'];
      const rows = attendees.map((row) => [
        row.guest_name ?? 'Guest',
        row.status ?? '',
        String(row.party_size ?? ''),
        formatTime(row.checked_in_at) ?? '',
        formatTime(row.client_arrived_at) ?? '',
        row.guest_phone ?? '',
        row.guest_email ?? '',
      ]);
      const filename = `class-roster-${session.name.replace(/[^a-z0-9]+/gi, '-')}-${session.date}.csv`;
      await buildAndShareCsv(filename, [header, ...rows]);
      toast.success('Roster export started.');
    } catch {
      toast.error('Could not export the roster.');
    }
  }, [attendees, session.name, session.date, toast]);
  const activeSpots = attendees
    .filter((row) => row.status !== 'Cancelled')
    .reduce((sum, row) => sum + (row.party_size || 1), 0);
  const capacityLabel =
    session.capacity != null && session.capacity > 0
      ? `${activeSpots} / ${session.capacity} booked`
      : `${activeSpots} booked`;

  return (
    <View style={styles.root}>
      {/* Session header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          accessibilityLabel="Back to timetable"
          tint={colors.brand}
          iconSize={22}
          onPress={onBack}
        />
        <View style={styles.headerText}>
          <Text variant="subheading" numberOfLines={1}>
            {session.name}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {formatDayHeading(session.date)} · {session.startTime} – {session.endTime}
          </Text>
          {instructorName ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {instructorName}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.capacityChip,
            { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
          ]}>
          <Text variant="caption" color={colors.brand}>
            {capacityLabel}
          </Text>
        </View>
        <IconButton
          icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
          accessibilityLabel="Export roster as CSV"
          tint={colors.brand}
          iconSize={20}
          disabled={attendees.length === 0}
          onPress={() => void onExport()}
        />
      </View>

      {query.isLoading ? (
        <ListSkeleton avatar />
      ) : query.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              query.error instanceof ApiError
                ? query.error.message
                : 'Could not load the roster for this session.'
            }
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }>
          {attendees.length === 0 ? (
            <EmptyState
              title="No bookings yet"
              message="When guests book this session, they will appear here."
            />
          ) : (
            attendees.map((row) => {
              const deposit = formatDeposit(row, currency);
              // Prefer the class check-in timestamp; fall back to arrived time.
              const presence = formatCheckedIn(row.checked_in_at) ?? formatArrived(row.client_arrived_at);
              const contact = row.guest_phone ?? row.guest_email ?? null;
              return (
                <Card
                  key={row.id}
                  style={styles.attendeeCard}
                  onPress={() => onOpenBooking(row.id)}
                  accessibilityLabel={`Open booking for ${row.guest_name}`}>
                  <View style={styles.attendeeHeader}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.attendeeName}>
                      {row.guest_name}
                    </Text>
                    <StatusPill status={row.status} />
                  </View>
                  <Text variant="caption" tone="secondary">
                    {row.party_size === 1 ? '1 spot' : `${row.party_size} spots`}
                    {contact ? ` · ${contact}` : ''}
                  </Text>
                  {deposit ? (
                    <Text variant="caption" tone="muted">
                      {deposit}
                    </Text>
                  ) : null}
                  {presence ? (
                    <Text variant="caption" color={colors.success}>
                      {presence}
                    </Text>
                  ) : null}
                </Card>
              );
            })
          )}

          {/* Capability note — these routes are cookie-only on the API. */}
          <View
            style={[
              styles.note,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Text variant="caption" tone="secondary">
              Tap an attendee to update their booking (confirm, start, no-show or cancel).
              Class check-in and cancelling the whole session are managed on the web
              dashboard.
            </Text>
          </View>
          <View style={styles.spacer} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  capacityChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  content: {
    padding: spacing.base,
    gap: spacing.sm,
  },
  attendeeCard: {
    minHeight: minTouchTarget,
    gap: spacing.xs,
  },
  attendeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  attendeeName: {
    flex: 1,
  },
  note: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  spacer: {
    height: spacing.xl,
  },
});
