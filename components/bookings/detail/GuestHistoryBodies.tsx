import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { bookingSourceLabel } from '@/lib/booking/booking-source-label';
import { bookingModelShortLabel } from '@/lib/booking/infer-booking-row-model';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useLinkedGuestHistory } from '@/lib/queries/useLinkedGuestHistory';
import { type LinkedBookingContext } from '@/lib/linked/linked-detail-policy';
import { writeRebookBootstrap } from '@/lib/rebook-bootstrap';
import type { GuestBookingHistoryRow } from '@/types/guest-detail';
import { restrictedVisitLabels } from '@/lib/roles/roles';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail } from '@/types/booking-detail';
import type { BookingListRow } from '@/types/booking-list';
import { historyRowAppointment } from '@/lib/booking/booking-detail-format';
import { spacing } from '@/theme/index';

// The guest history parts of the booking detail panel, moved out of
// `BookingDetailContent.tsx` unchanged (codebase standards P5.2).

/** Other visits for this guest — loaded lazily on first expand. */
export function GuestHistoryBody({
  guestId,
  currentBookingId,
}: {
  guestId: string;
  currentBookingId: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  // Fetch a few more than we list so "view all in Contacts" can be offered when
  // the guest has a deeper history than the inline cap (web parity).
  const HISTORY_FETCH_LIMIT = 25;
  const HISTORY_VISIBLE_CAP = 10;
  const detail = useGuestDetail(guestId, { bookingHistoryLimit: HISTORY_FETCH_LIMIT });

  const guest = detail.data?.guest;
  const otherVisits = (detail.data?.booking_history ?? []).filter(
    (row) => row.id !== currentBookingId,
  );
  const history = otherVisits.slice(0, HISTORY_VISIBLE_CAP);
  const hiddenCount = otherVisits.length - history.length;

  /** Rebook a past visit — re-seed its service/practitioner (when it has one) + guest. */
  const handleRebookRow = (row: GuestBookingHistoryRow) => {
    void (async () => {
      const appointment = historyRowAppointment(row);
      await writeRebookBootstrap({
        v: 1,
        guest: {
          // The client this booking is for: the new booking joins them (roles
          // plan §5.6), even when their phone and email are hidden from us.
          guestId,
          firstName: guest?.first_name ?? undefined,
          lastName: guest?.last_name ?? undefined,
          email: guest?.email ?? null,
          phone: guest?.phone ?? null,
        },
        ...(appointment ? { appointment } : {}),
      });
      router.push({ pathname: '/booking/new' });
    })();
  };

  return (
    <View style={styles.historyBody}>
      {detail.isLoading ? (
        <Text variant="bodySmall" tone="muted">
          Loading…
        </Text>
      ) : history.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No other bookings for this client.
        </Text>
      ) : (
        history.map((row) =>
          row.restricted ? (
            // "Hidden" (roles plan §5.11, UR20): someone else's visit, as its date, the service
            // and who it was with. It does not open, and there is nothing of it to rebook.
            <View key={row.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View style={styles.historyText}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {restrictedVisitLabels(row).service}
                </Text>
                <Text variant="caption" tone="muted">
                  {[row.booking_date, restrictedVisitLabels(row).withWhom].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              onPress={() => router.push(`/booking/${row.id}` as Href)}
              style={[styles.historyRow, { borderBottomColor: colors.border }]}>
              <View style={styles.historyText}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {row.detail_label || row.kind_label}
                </Text>
                <Text variant="caption" tone="muted">
                  {row.booking_date}
                  {row.booking_time ? ` · ${row.booking_time.slice(0, 5)}` : ''}
                  {bookingSourceLabel(row.source) ? ` · ${bookingSourceLabel(row.source)}` : ''}
                </Text>
              </View>
              <View style={styles.historyTrailing}>
                <StatusPill
                  status={row.status}
                  isTableReservation={row.booking_model === 'table_reservation'}
                />
                <Button
                  label="Rebook"
                  variant="ghost"
                  size="sm"
                  onPress={() => handleRebookRow(row)}
                />
              </View>
            </Pressable>
          ),
        )
      )}
      <Button
        label={hiddenCount > 0 ? `View all in Contacts (${otherVisits.length})` : 'View contact'}
        variant="ghost"
        size="sm"
        onPress={() => router.push(`/client/${guestId}` as Href)}
      />
    </View>
  );
}

/**
 * The guest's other visits at the PARTNER's venue, for a linked booking (web:
 * the same accordion with `historyVenueId`). Read through the bookings list
 * route under the owner venue, since our guests route does not know the
 * partner's client. A row opens the same panel with the link carried along;
 * a full grant may rebook from one, at the partner's venue. There is no
 * Contacts screen to view the rest in, so the cap says how many more there are.
 */
export function LinkedGuestHistoryBody({
  guestId,
  currentBookingId,
  guest,
  linked,
  canRebook,
}: {
  guestId: string;
  currentBookingId: string;
  guest: BookingDetail['guest'];
  linked: LinkedBookingContext;
  canRebook: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const HISTORY_VISIBLE_CAP = 10;
  const history = useLinkedGuestHistory(linked.venueId, guestId);
  // Latest first, as our own guest history reads.
  const otherVisits = (history.data?.bookings ?? [])
    .filter((row) => row.id !== currentBookingId)
    .sort(
      (a, b) =>
        b.booking_date.localeCompare(a.booking_date) ||
        (b.booking_time ?? '').localeCompare(a.booking_time ?? ''),
    );
  const rows = otherVisits.slice(0, HISTORY_VISIBLE_CAP);
  const hiddenCount = otherVisits.length - rows.length;

  const openRow = (row: BookingListRow) =>
    router.push({
      pathname: '/booking/[id]',
      params: {
        id: row.id,
        linkedAct: linked.act,
        linkedVenueId: linked.venueId,
        linkedVenueName: linked.venueName,
        linkedPii: linked.pii ? '1' : '0',
        ...(row.calendar_name ? { linkedPractitionerName: row.calendar_name } : {}),
      },
    } as Href);

  /** Rebook a past visit at the partner's venue: the same seeding as our own rows. */
  const handleRebookRow = (row: BookingListRow) => {
    void (async () => {
      const practitionerId = row.practitioner_id ?? row.calendar_id ?? null;
      const serviceId = row.appointment_service_id ?? row.service_item_id ?? null;
      const start = row.booking_time ? timeToMinutes(row.booking_time) : null;
      const end = row.booking_end_time ? timeToMinutes(row.booking_end_time) : null;
      const appointment =
        practitionerId && serviceId
          ? {
              serviceId,
              practitionerId,
              variantId: row.service_variant_id ?? null,
              durationMinutes: start != null && end != null && end > start ? end - start : null,
            }
          : null;
      await writeRebookBootstrap({
        v: 1,
        guest: {
          // The client this booking is for: the new booking joins them (roles
          // plan §5.6), even when their phone and email are hidden from us.
          guestId,
          firstName: guest?.first_name ?? undefined,
          lastName: guest?.last_name ?? undefined,
          email: guest?.email ?? null,
          phone: guest?.phone ?? null,
        },
        ...(appointment ? { appointment } : {}),
      });
      router.push({
        pathname: '/booking/new',
        params: { ownerVenueId: linked.venueId, ownerVenueName: linked.venueName },
      });
    })();
  };

  return (
    <View style={styles.historyBody}>
      {history.isLoading ? (
        <Text variant="bodySmall" tone="muted">
          Loading…
        </Text>
      ) : history.isError ? (
        <Text variant="bodySmall" tone="muted">
          {`Could not load the client's bookings at ${linked.venueName}.`}
        </Text>
      ) : rows.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No other bookings for this client.
        </Text>
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            onPress={() => openRow(row)}
            style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <View style={styles.historyText}>
              <Text variant="bodySmall" numberOfLines={1}>
                {row.booking_item_name?.trim() ||
                  (row.booking_model ? bookingModelShortLabel(row.booking_model) : 'Booking')}
              </Text>
              <Text variant="caption" tone="muted">
                {row.booking_date}
                {row.booking_time ? ` · ${row.booking_time.slice(0, 5)}` : ''}
              </Text>
            </View>
            <View style={styles.historyTrailing}>
              <StatusPill
                status={row.status}
                isTableReservation={row.booking_model === 'table_reservation'}
              />
              {canRebook ? (
                <Button
                  label="Rebook"
                  variant="ghost"
                  size="sm"
                  onPress={() => handleRebookRow(row)}
                />
              ) : null}
            </View>
          </Pressable>
        ))
      )}
      {hiddenCount > 0 ? (
        <Text variant="caption" tone="muted">
          {`${hiddenCount} more at ${linked.venueName}.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  historyBody: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  historyTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
