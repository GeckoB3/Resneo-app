import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ResourceDayBookingRow, ResourceListItem } from '@/lib/queries/useResources';
import { minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** "10:00–11:30" (or "10:00" when no end time is stored). */
function timeRangeLabel(row: ResourceDayBookingRow): string {
  const start = row.booking_time ? row.booking_time.slice(0, 5) : '—';
  const end = row.booking_end_time ? row.booking_end_time.slice(0, 5) : null;
  return end ? `${start}–${end}` : start;
}

function isCancelled(status: string): boolean {
  return status.toLowerCase().includes('cancel');
}

/** "Deposit paid" / "Deposit pending" style caption, when the booking carries one. */
function depositLabel(row: ResourceDayBookingRow): string | null {
  if (!row.deposit_status) return null;
  const amount =
    row.deposit_amount_pence != null && row.deposit_amount_pence > 0
      ? ` £${(row.deposit_amount_pence / 100).toFixed(2)}`
      : '';
  return `Deposit${amount} · ${row.deposit_status}`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

type ResourceDaySectionProps = {
  resource: ResourceListItem;
  /** This resource's bookings for the selected day, sorted by start time. */
  bookings: ResourceDayBookingRow[];
  onPressBooking: (bookingId: string) => void;
  /** Book a slot on this resource (web's "Book this resource"). */
  onBook?: (resourceId: string) => void;
  /** Open the editor for this resource's setup (slot grid, pricing, hours). */
  onEdit?: (resourceId: string) => void;
};

/**
 * One resource's day: header (colour dot, name, active state, count), optional
 * Book / Edit actions, and the day's bookings as tappable rows — time, guest,
 * status. Mirrors the web resource-timeline panel (list, no drag/drop).
 */
export function ResourceDaySection({
  resource,
  bookings,
  onPressBooking,
  onBook,
  onEdit,
}: ResourceDaySectionProps) {
  const { colors } = useTheme();

  // Booking a resource needs an active, bookable column (the booking flow only
  // offers active resources); editing is always available.
  const canBook = Boolean(onBook) && resource.is_active;
  const showActions = canBook || Boolean(onEdit);

  return (
    <Card padded={false}>
      <View style={styles.header}>
        <View
          style={[styles.colourDot, { backgroundColor: resource.colour ?? colors.brand }]}
        />
        <Text variant="bodyMedium" numberOfLines={1} style={styles.name}>
          {resource.name}
        </Text>
        {!resource.is_active ? <Badge label="Inactive" tone="neutral" /> : null}
        <Text variant="caption" tone="muted">
          {bookings.length === 0
            ? 'No bookings'
            : `${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`}
        </Text>
      </View>

      {showActions ? (
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          {canBook ? (
            <Button
              label="Book"
              variant="secondary"
              size="sm"
              style={styles.actionBtn}
              onPress={() => onBook!(resource.id)}
            />
          ) : null}
          {onEdit ? (
            <Button
              label="Edit"
              variant="ghost"
              size="sm"
              style={styles.actionBtn}
              onPress={() => onEdit(resource.id)}
            />
          ) : null}
        </View>
      ) : null}

      {bookings.length === 0 ? (
        <View style={[styles.emptyRow, { borderTopColor: colors.border }]}>
          <Text variant="bodySmall" tone="muted">
            Nothing booked for this day.
          </Text>
        </View>
      ) : (
        bookings.map((booking) => {
          const cancelled = isCancelled(booking.status);
          const deposit = depositLabel(booking);
          return (
            <Pressable
              key={booking.id}
              accessibilityRole="button"
              accessibilityLabel={`${timeRangeLabel(booking)}, ${booking.guest_name}, ${booking.status}`}
              onPress={() => onPressBooking(booking.id)}
              style={({ pressed }) => [
                styles.bookingRow,
                { borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <View style={[styles.rowInner, cancelled && styles.cancelled]}>
                <Text variant="label" style={styles.time}>
                  {timeRangeLabel(booking)}
                </Text>
                <View style={styles.guestCol}>
                  <Text variant="bodySmall" numberOfLines={1}>
                    {booking.guest_name}
                  </Text>
                  {booking.party_size > 1 ? (
                    <Text variant="caption" tone="muted">
                      {booking.party_size} guests
                    </Text>
                  ) : null}
                  {deposit ? (
                    <Text variant="caption" tone="muted">
                      {deposit}
                    </Text>
                  ) : null}
                </View>
                <StatusPill status={booking.status} />
              </View>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  colourDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  name: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  emptyRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  bookingRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  cancelled: {
    opacity: 0.55,
  },
  time: {
    minWidth: 92,
  },
  guestCol: {
    flex: 1,
    gap: 2,
  },
});
