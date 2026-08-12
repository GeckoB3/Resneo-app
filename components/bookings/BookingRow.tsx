import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ComplianceFlagDot } from '@/components/compliance/ComplianceFlagBadge';
import { StatusPill } from '@/components/ui/Badge';
import { Dot } from '@/components/ui/Dot';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { formatPence } from '@/lib/format';
import {
  bookingDisplayVisualKey,
  bookingStatusVisualForKey,
} from '@/lib/booking/booking-status-visual';
import {
  depositPillAppliesToStatus,
  showAttendanceConfirmedSupplementPill,
  showDepositFailedPill,
  showDepositPendingPill,
} from '@/lib/booking/booking-staff-indicators';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

type BookingRowProps = {
  booking: BookingListRow;
  /** Drives guest vs cover wording in the subtitle. */
  isAppointment: boolean;
  onPress: (id: string) => void;
  /** Long-press enters bulk-selection mode. */
  onLongPress?: (id: string) => void;
  /** When true, the row shows a selected ring and checkbox indicator. */
  selected?: boolean;
  /** When true, selection mode is active — all rows show their select state. */
  selectionMode?: boolean;
  /** Per-booking compliance flag — renders a small coloured dot by the name. */
  complianceFlag?: ComplianceBookingFlag | null;
};

/** Confirmed visual (navy) — reused for the attendance supplement pill. */
const CONFIRMED_VISUAL = bookingStatusVisualForKey('Confirmed');

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

/** A single booking in the list — time-led, tap opens detail, long-press enters selection mode. */
function BookingRowBase({
  booking,
  isAppointment,
  onPress,
  onLongPress,
  selected = false,
  selectionMode = false,
  complianceFlag,
}: BookingRowProps) {
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
  // Web parity: show the amount alongside the status on the pill when known
  // ("£20.00 · Paid"), falling back to the bare status when there's no figure.
  const depositAmount = formatPence(booking.deposit_amount_pence);
  const depositText =
    depositAmount && booking.deposit_status
      ? `${depositAmount} · ${booking.deposit_status}`
      : booking.deposit_status;
  const attendanceConfirmed =
    !!booking.guest_attendance_confirmed_at || !!booking.staff_attendance_confirmed_at;
  const arrived = !!booking.client_arrived_at;
  // Signature at-a-glance scan: a colour stripe keyed to lifecycle + attendance + arrived.
  const stripeColor = bookingStatusVisualForKey(bookingDisplayVisualKey(booking)).listStripeColor;
  // Supplement "Confirmed" pill when attendance is confirmed but lifecycle status isn't (web parity).
  const showConfirmedSupplement = showAttendanceConfirmedSupplementPill(booking);
  const showDepositPending = showDepositPendingPill(booking);
  // A failed deposit was invisible in the app: a booking whose payment bounced
  // looked identical to one with no deposit at all. Red, and louder than
  // "Deposit due" — the money is not merely outstanding, an attempt failed.
  const showDepositFailed =
    showDepositFailedPill(booking) && depositPillAppliesToStatus(booking.status);

  return (
    <PressableScale
      accessibilityLabel={`${formatTime(booking.booking_time)}, ${booking.guest_name}, ${bookingStatusDisplayLabel(booking.status, booking.booking_model === 'table_reservation')}${arrived ? ', arrived' : attendanceConfirmed ? ', confirmed' : ''}`}
      onPress={() => {
        if (selectionMode) {
          hapticSelect();
          onLongPress?.(booking.id);
        } else {
          onPress(booking.id);
        }
      }}
      onLongPress={() => {
        hapticSelect();
        onLongPress?.(booking.id);
      }}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.brandSubtle : colors.surfaceRaised,
          borderColor: selected ? colors.brand : colors.border,
          borderLeftWidth: 3,
          borderLeftColor: stripeColor,
        },
      ]}>
      {/* Selection checkbox indicator */}
      {selectionMode ? (
        <View
          style={[
            styles.checkbox,
            {
              backgroundColor: selected ? colors.brand : colors.surface,
              borderColor: selected ? colors.brand : colors.borderStrong,
            },
          ]}>
          {selected ? (
            <Text variant="caption" color={colors.onBrand} style={styles.checkmark}>
              ✓
            </Text>
          ) : null}
        </View>
      ) : null}

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
            <Dot color={colors.accent} />
          ) : attendanceConfirmed ? (
            <Dot color={colors.success} />
          ) : null}
          <ComplianceFlagDot flag={complianceFlag} />
        </View>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.trailing}>
        <View style={styles.pillRow}>
          {showConfirmedSupplement ? (
            <View
              style={[
                styles.supplementPill,
                {
                  backgroundColor: CONFIRMED_VISUAL.backgroundColor,
                  borderColor: CONFIRMED_VISUAL.borderColor,
                },
              ]}
              accessibilityLabel="Confirmed">
              <Text variant="caption" color={CONFIRMED_VISUAL.textColor} style={styles.supplementText}>
                Confirmed
              </Text>
            </View>
          ) : null}
          <StatusPill
            status={booking.status}
            isTableReservation={booking.booking_model === 'table_reservation'}
          />
        </View>
        {showDepositFailed ? (
          <View
            style={[styles.depositPill, { backgroundColor: colors.dangerSurface }]}
            accessibilityLabel="Deposit failed">
            <Text variant="caption" color={colors.danger} style={styles.supplementText}>
              Deposit failed
            </Text>
          </View>
        ) : showDepositPending ? (
          <View
            style={[styles.depositPill, { backgroundColor: colors.warningSurface }]}
            accessibilityLabel="Deposit pending">
            <Text variant="caption" color={colors.warning} style={styles.supplementText}>
              Deposit due
            </Text>
          </View>
        ) : showDeposit ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {depositText}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/** Memoized so rows skip re-render while scrolling / selecting other rows. */
export const BookingRow = memo(BookingRowBase);

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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    lineHeight: 14,
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
  subtitle: {
    marginTop: 0,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  supplementPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  depositPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  supplementText: {
    fontFamily: fonts.semibold,
  },
});
