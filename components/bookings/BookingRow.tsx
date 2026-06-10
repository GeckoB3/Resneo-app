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

  const addonCount = booking.addons_count ?? 0;
  const subtitle = [
    booking.service_variant_name ?? booking.booking_item_name,
    booking.calendar_name,
    partyLabel(booking.party_size, isAppointment),
    addonCount > 0 ? `+${addonCount} add-on${addonCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const showDeposit = booking.deposit_status && !HIDDEN_DEPOSIT.has(booking.deposit_status);
  const attendanceConfirmed =
    !!booking.guest_attendance_confirmed_at || !!booking.staff_attendance_confirmed_at;
  const arrived = !!booking.client_arrived_at;

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
        <View style={styles.nameRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.name}>
            {booking.guest_name}
          </Text>
          {arrived ? (
            <View style={[styles.dot, { backgroundColor: colors.accent }]} accessibilityLabel="Arrived" />
          ) : attendanceConfirmed ? (
            <View
              style={[styles.dot, { backgroundColor: colors.success }]}
              accessibilityLabel="Attendance confirmed"
            />
          ) : null}
        </View>
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subtitle: {
    marginTop: 0,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
});
