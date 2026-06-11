import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ComplianceFlagDot } from '@/components/compliance/ComplianceFlagBadge';
import { Text } from '@/components/ui/Text';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import {
  bookingCalendarBlockPalette,
  isArrivedWaitingDisplay,
} from '@/lib/booking/booking-status-visual';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { hexToRgba } from '@/lib/color';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { TIME_GUTTER_WIDTH } from '@/components/calendar/grid-layout';

// ---------------------------------------------------------------------------
// Status action tray helpers — mirrors web BookingCardInfo action buttons
// ---------------------------------------------------------------------------

/** Tray action: label shown on the button and the status/attendance value to apply. */
type TrayAction =
  | { kind: 'status'; status: string; label: string }
  | { kind: 'arrived'; arrived: boolean; label: string }
  | { kind: 'clearArrived'; label: string };

/**
 * Pick up to 2 compact tray actions for a block given its current status and
 * arrived state. Follows the web priority order:
 * - Pending   → Confirm + Arrived
 * - Booked    → Confirm + Arrived
 * - Confirmed → Start + Arrived (or Arrived-waiting → Start + Clear)
 * - Seated    → Complete + Undo
 * - Completed → Reopen
 * - No-Show   → Reopen
 */
export function pickTrayActions(params: {
  status: string;
  clientArrivedAt?: string | null;
  height: number;
}): TrayAction[] {
  const { status, clientArrivedAt, height } = params;
  const hasArrived = !!clientArrivedAt;
  const showArrived = height >= 56; // Only show arrived toggle on tall-enough blocks

  switch (status) {
    case 'Pending':
    case 'Booked': {
      const actions: TrayAction[] = [{ kind: 'status', status: 'Confirmed', label: 'Confirm' }];
      if (showArrived) {
        actions.push(
          hasArrived
            ? { kind: 'clearArrived', label: 'Clear' }
            : { kind: 'arrived', arrived: true, label: 'Arrived' },
        );
      }
      return actions;
    }
    case 'Confirmed': {
      const actions: TrayAction[] = [{ kind: 'status', status: 'Seated', label: 'Start' }];
      if (showArrived) {
        actions.push(
          hasArrived
            ? { kind: 'clearArrived', label: 'Clear' }
            : { kind: 'arrived', arrived: true, label: 'Arrived' },
        );
      }
      return actions;
    }
    case 'Seated':
      return [
        { kind: 'status', status: 'Completed', label: 'Complete' },
        { kind: 'status', status: 'Confirmed', label: 'Undo' },
      ];
    case 'Completed':
      return [{ kind: 'status', status: 'Confirmed', label: 'Reopen' }];
    case 'No-Show':
      return [{ kind: 'status', status: 'Booked', label: 'Reopen' }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AppointmentBlockProps = {
  id: string;
  guestName: string;
  serviceName: string;
  timeLabel: string;
  status: string;
  /** Attendance overlay — an arrived-but-not-started guest colours the bar amber. */
  clientArrivedAt?: string | null;
  staffAttendanceConfirmedAt?: string | null;
  guestAttendanceConfirmedAt?: string | null;
  top: number;
  height: number;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** Fired when a quick-status tray button is tapped. */
  onStatusChange?: (id: string, status: string) => void;
  /** Fired when the arrived toggle is tapped. */
  onArrivalToggle?: (id: string, arrived: boolean) => void;
  /** True while a status/arrival mutation for this block is in flight. */
  actionPending?: boolean;
  /** Per-booking compliance flag — renders a small coloured dot top-right. */
  complianceFlag?: ComplianceBookingFlag | null;
  /**
   * Override the left offset of the block (pixels from the column edge).
   * Defaults to TIME_GUTTER_WIDTH + spacing.xs when not supplied.
   */
  blockLeft?: number;
};

/** A positioned appointment card on the day grid — filled with its status colour. */
export function AppointmentBlock({
  id,
  guestName,
  serviceName,
  timeLabel,
  status,
  clientArrivedAt,
  staffAttendanceConfirmedAt,
  guestAttendanceConfirmedAt,
  top,
  height,
  onPress,
  onLongPress,
  onStatusChange,
  onArrivalToggle,
  actionPending = false,
  blockLeft,
  complianceFlag,
}: AppointmentBlockProps) {
  const computedLeft = blockLeft ?? TIME_GUTTER_WIDTH + spacing.xs;
  const compact = height < 52;
  const palette = bookingCalendarBlockPalette({
    status,
    client_arrived_at: clientArrivedAt,
    staff_attendance_confirmed_at: staffAttendanceConfirmedAt,
    guest_attendance_confirmed_at: guestAttendanceConfirmedAt,
  });
  const arrivedWaiting = isArrivedWaitingDisplay({ status, client_arrived_at: clientArrivedAt });
  const statusLabel = `${bookingStatusDisplayLabel(status, false)}${arrivedWaiting ? ', arrived' : ''}`;

  const showTray = (onStatusChange || onArrivalToggle) && !compact;
  const trayActions = showTray
    ? pickTrayActions({ status, clientArrivedAt, height })
    : [];

  function handleTrayAction(action: TrayAction) {
    if (action.kind === 'status') {
      onStatusChange?.(id, action.status);
    } else if (action.kind === 'arrived') {
      onArrivalToggle?.(id, true);
    } else if (action.kind === 'clearArrived') {
      onArrivalToggle?.(id, false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}, ${guestName}, ${serviceName}, ${statusLabel}`}
      accessibilityHint="Tap to open, long-press to reschedule"
      onPress={() => onPress(id)}
      onLongPress={onLongPress ? () => onLongPress(id) : undefined}
      style={({ pressed }) => [
        styles.block,
        {
          top,
          height,
          left: computedLeft,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {/* Glass left edge — a luminous highlight that lifts the lozenge off the grid. */}
      <View style={styles.glassEdge} />
      {/* Compliance flag — top-right corner (clears the bottom-right action tray). */}
      {complianceFlag ? (
        <View style={styles.complianceDot} pointerEvents="none">
          <ComplianceFlagDot flag={complianceFlag} />
        </View>
      ) : null}
      <View style={styles.content}>
        <Text variant="caption" numberOfLines={1} style={[styles.guest, { color: palette.text }]}>
          {guestName}
        </Text>
        {!compact ? (
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: hexToRgba(palette.text, 0.82) }}>
            {serviceName} · {timeLabel}
          </Text>
        ) : null}
      </View>

      {/* Quick-status action tray — bottom-right corner, independent hit targets. */}
      {trayActions.length > 0 ? (
        <View
          style={styles.tray}
          // Prevent tray area from bubbling to the block's onPress.
          onStartShouldSetResponder={() => true}>
          {actionPending ? (
            <ActivityIndicator size="small" color={palette.text} style={styles.traySpinner} />
          ) : (
            trayActions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleTrayAction(action);
                }}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.trayBtn,
                  {
                    backgroundColor: hexToRgba(palette.text, pressed ? 0.3 : 0.2),
                    borderColor: hexToRgba(palette.text, 0.35),
                  },
                ]}>
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[styles.trayBtnLabel, { color: palette.text }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    right: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  glassEdge: {
    width: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  complianceDot: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.sm,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    justifyContent: 'flex-start',
    gap: 1,
  },
  guest: {
    fontFamily: fonts.semibold,
  },
  tray: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.sm,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  traySpinner: {
    marginRight: spacing.xs,
  },
  trayBtn: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    minHeight: minTouchTarget,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBtnLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 14,
  },
});
