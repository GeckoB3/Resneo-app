import { Pressable, StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type BookingRowProps = {
  booking: BookingListRow;
  /** Drives guest vs cover wording in the subtitle. */
  isAppointment: boolean;
  onPress: (id: string) => void;
};

/** Deposit values that aren't worth surfacing in a list row. */
const HIDDEN_DEPOSIT = new Set(['N/A', 'Not Required', 'None', '']);

function formatTime(time: string | null): string {
  if (!time) {
    return '—';
  }
  return time.slice(0, 5); // HH:mm
}

function partyLabel(partySize: number, isAppointment: boolean): string | null {
  if (!partySize || partySize < 1) {
    return null;
  }
  const noun = isAppointment ? 'guest' : 'cover';
  return `${partySize} ${noun}${partySize === 1 ? '' : 's'}`;
}

/** A single booking in the list — time-led, tap navigates to detail. */
export function BookingRow({ booking, isAppointment, onPress }: BookingRowProps) {
  const { colors } = useTheme();

  const subtitle = [booking.booking_item_name, partyLabel(booking.party_size, isAppointment)]
    .filter(Boolean)
    .join(' · ');
  const showDeposit = booking.deposit_status && !HIDDEN_DEPOSIT.has(booking.deposit_status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatTime(booking.booking_time)}, ${booking.guest_name}, ${booking.status}`}
      onPress={() => onPress(booking.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.timeCol}>
        <Text variant="label" style={styles.time}>
          {formatTime(booking.booking_time)}
        </Text>
      </View>

      <View style={styles.main}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {booking.guest_name}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <StatusPill status={booking.status} />
        {showDeposit ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {booking.deposit_status}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget + 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  timeCol: {
    width: 46,
  },
  time: {
    fontVariant: ['tabular-nums'],
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  subtitle: {
    marginTop: 0,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
});
