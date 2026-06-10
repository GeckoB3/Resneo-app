import { format, parseISO } from 'date-fns';
import { StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { formatPositivePence } from '@/lib/format';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { spacing } from '@/theme/index';

type BookingPeekSheetProps = {
  bookingId: string | null;
  onClose: () => void;
  /** Push the full booking-detail screen. */
  onOpenFull: (bookingId: string) => void;
};

function formatWhen(date: string, time: string, endTime?: string | null): string {
  try {
    const parsed = parseISO(`${date}T${time.slice(0, 5)}:00`);
    const start = format(parsed, 'EEE d MMM · HH:mm');
    return endTime?.trim() ? `${start}–${endTime.slice(0, 5)}` : start;
  } catch {
    return `${date} · ${time.slice(0, 5)}`;
  }
}

/**
 * Quick peek at a booking from the calendar grid — the essentials plus a
 * one-tap path to the full detail screen (mirrors the web's popover).
 */
export function BookingPeekSheet({ bookingId, onClose, onOpenFull }: BookingPeekSheetProps) {
  const query = useBookingDetail(bookingId ?? undefined);
  const booking = query.data;

  const guestName = booking?.guest
    ? [booking.guest.first_name, booking.guest.last_name].filter(Boolean).join(' ') || 'Guest'
    : 'Guest';
  const deposit = formatPositivePence(booking?.deposit_amount_pence);

  return (
    <Sheet visible={!!bookingId} onClose={onClose}>
      {query.isLoading || !booking ? (
        <Text variant="bodySmall" tone="muted" style={styles.loading}>
          Loading booking…
        </Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Avatar name={guestName} size={44} />
            <View style={styles.headerText}>
              <Text variant="subheading" numberOfLines={1}>
                {guestName}
              </Text>
              <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                {formatWhen(booking.booking_date, booking.booking_time, booking.booking_end_time)}
              </Text>
            </View>
            <StatusPill status={booking.status} />
          </View>

          {booking.service_variant_name ? (
            <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
              {booking.service_variant_name}
              {deposit ? ` · Deposit ${deposit}${booking.deposit_status ? ` (${booking.deposit_status})` : ''}` : ''}
            </Text>
          ) : null}
          {booking.special_requests?.trim() ? (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              “{booking.special_requests.trim()}”
            </Text>
          ) : null}

          <Button label="Open full details" fullWidth onPress={() => onOpenFull(booking.id)} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  body: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
