import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ComplianceFlagDot } from '@/components/compliance/ComplianceFlagBadge';
import { Text } from '@/components/ui/Text';
import { ACTION_COLORS, type ActionColors } from '@/lib/booking/booking-action-colors';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import {
  bookingCalendarBlockPalette,
  isArrivedWaitingDisplay,
} from '@/lib/booking/booking-status-visual';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { hexToRgba } from '@/lib/color';
import { fonts, radius } from '@/theme/index';

// ---------------------------------------------------------------------------
// Density rules — how much detail fits at a given block height.
// Mobile adaptation of the web's pickInfoRowCount (BookingCardInfo.tsx).
// ---------------------------------------------------------------------------

type Density = {
  /** Rows of text to show: 1 = name·time, 2 = +service, 3 = +time, 4 = +status. */
  rows: 1 | 2 | 3 | 4;
  /** How many quick-action buttons fit (0–2). */
  trayActions: 0 | 1 | 2;
};

/**
 * Decide visible text rows + action-tray size from the block's height and how
 * many overlap lanes share its column.
 *
 * The action tray shows on EVERY block tall enough for one compact button row
 * beneath the name (≈ the grid's MIN_BLOCK_HEIGHT) — it is not reserved for tall
 * blocks. How many actions fit (1 vs 2) is governed by WIDTH (lane count), since
 * the buttons sit side-by-side, not by height. Text rows grow with the space
 * left above the tray, so a row never collides with the buttons.
 */
export function pickBlockDensity(height: number, laneCount: number): Density {
  // Two compact actions fit a full- or half-width column; 3+ lanes are too
  // narrow, so only the primary action shows.
  const trayActions: Density['trayActions'] = height >= 32 ? (laneCount >= 3 ? 1 : 2) : 0;
  // Rows that fit in the space left above the tray (height − paddings − tray).
  const rows: Density['rows'] = height >= 80 ? 4 : height >= 64 ? 3 : height >= 50 ? 2 : 1;
  return { rows, trayActions };
}

// ---------------------------------------------------------------------------
// Status action tray helpers — mirrors web BookingCardInfo action buttons
// ---------------------------------------------------------------------------

/** Tray action: label shown on the button and the status/attendance value to apply. */
type TrayAction =
  | { kind: 'status'; status: string; label: string }
  | { kind: 'arrived'; arrived: boolean; label: string }
  | { kind: 'clearArrived'; label: string };

/**
 * Quick actions for a block — mirrors the web /dashboard/calendar on-block
 * buttons exactly (PractitionerCalendarView quick actions):
 * - Pending   → Arrived | Confirm (→ Booked)
 * - Booked    → Arrived | Start (→ Seated)
 * - Confirmed → Arrived | Start (→ Seated)
 * - Seated    → Undo start (→ Booked) | Complete
 * - Completed → Reopen (→ Seated)
 * - Cancelled / No-Show → none
 * When only one button fits, the status action wins over the arrived toggle
 * (web omission rule).
 */
export function pickTrayActions(params: {
  status: string;
  clientArrivedAt?: string | null;
  max: number;
}): TrayAction[] {
  const { status, clientArrivedAt, max } = params;
  if (max <= 0) return [];
  const hasArrived = !!clientArrivedAt;
  const arrivedToggle: TrayAction = hasArrived
    ? { kind: 'clearArrived', label: 'Clear' }
    : { kind: 'arrived', arrived: true, label: 'Arrived' };

  switch (status) {
    case 'Pending': {
      const confirm: TrayAction = { kind: 'status', status: 'Booked', label: 'Confirm' };
      return max >= 2 ? [arrivedToggle, confirm] : [confirm];
    }
    case 'Booked':
    case 'Confirmed': {
      const start: TrayAction = { kind: 'status', status: 'Seated', label: 'Start' };
      return max >= 2 ? [arrivedToggle, start] : [start];
    }
    case 'Seated': {
      const complete: TrayAction = { kind: 'status', status: 'Completed', label: 'Complete' };
      const undo: TrayAction = { kind: 'status', status: 'Booked', label: 'Undo' };
      return max >= 2 ? [undo, complete] : [complete];
    }
    case 'Completed':
      return [{ kind: 'status', status: 'Seated', label: 'Reopen' }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reserved vertical space (px) below the text for the action tray. Must track
 * the tray's height (`bottom` offset + button {@link styles.trayBtn} minHeight)
 * so the bottom-anchored buttons never overlap the text above them.
 */
const TRAY_HEIGHT = 24;

type AppointmentBlockProps = {
  id: string;
  guestName: string;
  serviceName: string;
  /** "HH:mm–HH:mm" range label. */
  timeLabel: string;
  status: string;
  /** Attendance overlay — an arrived-but-not-started guest colours the bar amber. */
  clientArrivedAt?: string | null;
  staffAttendanceConfirmedAt?: string | null;
  guestAttendanceConfirmedAt?: string | null;
  /** Visual height (px) the card is being rendered at. */
  height: number;
  /** Overlap lane within the column (0-based) and total lanes in the cluster. */
  laneIndex?: number;
  laneCount?: number;
  onPress: (id: string) => void;
  /** Fired when a quick-status tray button is tapped. */
  onStatusChange?: (id: string, status: string) => void;
  /** Fired when the arrived toggle is tapped. */
  onArrivalToggle?: (id: string, arrived: boolean) => void;
  /** True while a status/arrival mutation for this block is in flight. */
  actionPending?: boolean;
  /** Per-booking compliance flag — renders a small coloured dot top-right. */
  complianceFlag?: ComplianceBookingFlag | null;
};

/**
 * The visual card for one appointment on the day grid. Fills its parent
 * (positioning — top/height/lane left/width — is owned by the wrapper in
 * CalendarDayGrid), adapts its content to the space available, and renders
 * compact quick-status actions that never overlap the text.
 */
export function AppointmentBlock({
  id,
  guestName,
  serviceName,
  timeLabel,
  status,
  clientArrivedAt,
  staffAttendanceConfirmedAt,
  guestAttendanceConfirmedAt,
  height,
  laneIndex = 0,
  laneCount = 1,
  onPress,
  onStatusChange,
  onArrivalToggle,
  actionPending = false,
  complianceFlag,
}: AppointmentBlockProps) {
  const palette = bookingCalendarBlockPalette({
    status,
    client_arrived_at: clientArrivedAt,
    staff_attendance_confirmed_at: staffAttendanceConfirmedAt,
    guest_attendance_confirmed_at: guestAttendanceConfirmedAt,
  });
  const arrivedWaiting = isArrivedWaitingDisplay({ status, client_arrived_at: clientArrivedAt });
  const statusLabel = `${bookingStatusDisplayLabel(status, false)}${arrivedWaiting ? ' · arrived' : ''}`;

  const density = pickBlockDensity(height, laneCount);
  const squeezed = laneCount >= 2;

  const trayEnabled = !!(onStatusChange || onArrivalToggle);
  const trayActions = trayEnabled
    ? pickTrayActions({ status, clientArrivedAt, max: density.trayActions })
    : [];
  const showTray = trayActions.length > 0 || (trayEnabled && actionPending && height >= 32);

  function handleTrayAction(action: TrayAction) {
    if (action.kind === 'status') {
      onStatusChange?.(id, action.status);
    } else if (action.kind === 'arrived') {
      onArrivalToggle?.(id, true);
    } else {
      onArrivalToggle?.(id, false);
    }
  }

  /** Web-parity button colour per action; null = neutral translucent chip. */
  function trayActionColors(action: TrayAction): ActionColors | null {
    if (action.kind === 'arrived') return ACTION_COLORS.arrived;
    if (action.kind === 'clearArrived') return null;
    switch (action.status) {
      case 'Booked':
        return action.label === 'Confirm' ? ACTION_COLORS.confirm : null;
      case 'Seated':
        return action.label === 'Reopen' ? ACTION_COLORS.confirm : ACTION_COLORS.start;
      case 'Completed':
        return ACTION_COLORS.complete;
      default:
        return null;
    }
  }

  const subtleText = hexToRgba(palette.text, 0.82);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}, ${guestName}, ${serviceName}, ${statusLabel}`}
      accessibilityHint="Tap to open. Touch and hold to move."
      onPress={() => onPress(id)}
      style={({ pressed }) => [
        styles.block,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {/* Status accent stripe (web parity: left colour bar). */}
      <View style={[styles.accentStripe, { backgroundColor: palette.accent }]} />

      {/* Compliance flag — top-right corner. */}
      {complianceFlag ? (
        <View style={styles.complianceDot} pointerEvents="none">
          <ComplianceFlagDot flag={complianceFlag} />
        </View>
      ) : null}

      <View
        style={[
          styles.content,
          squeezed && styles.contentSqueezed,
          showTray && { paddingBottom: TRAY_HEIGHT },
        ]}
        pointerEvents="none">
        {density.rows === 1 ? (
          <Text numberOfLines={1} style={[styles.rowName, { color: palette.text }]}>
            {guestName} · {timeLabel.split('–')[0]}
          </Text>
        ) : (
          <>
            <Text numberOfLines={1} style={[styles.rowName, { color: palette.text }]}>
              {guestName}
            </Text>
            {/* Service name is prioritised over the time text: the bar's
                position + height already encode when/how-long, so the service
                is the more useful second line on a compact (2-row) block. */}
            <Text numberOfLines={1} style={[styles.rowMeta, { color: subtleText }]}>
              {serviceName || timeLabel}
            </Text>
            {density.rows >= 3 && serviceName ? (
              <Text numberOfLines={1} style={[styles.rowMeta, { color: subtleText }]}>
                {timeLabel}
              </Text>
            ) : null}
            {density.rows >= 4 ? (
              <View style={styles.statusChipRow}>
                <View style={[styles.statusChip, { backgroundColor: hexToRgba('#FFFFFF', 0.9) }]}>
                  <View style={[styles.statusChipDot, { backgroundColor: palette.accent }]} />
                  <Text numberOfLines={1} style={[styles.statusChipLabel, { color: palette.accent }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      {/* Quick-status tray — bottom-right, compact, never overlaps content. */}
      {showTray ? (
        <View style={styles.tray} onStartShouldSetResponder={() => true}>
          {actionPending ? (
            <ActivityIndicator size="small" color={palette.text} />
          ) : (
            trayActions.map((action) => {
              const actionColors = trayActionColors(action);
              return (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleTrayAction(action);
                  }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.trayBtn,
                    actionColors
                      ? {
                          backgroundColor: actionColors.background,
                          borderColor: hexToRgba('#FFFFFF', 0.55),
                          opacity: pressed ? 0.8 : 1,
                        }
                      : {
                          backgroundColor: hexToRgba('#FFFFFF', pressed ? 0.4 : 0.25),
                          borderColor: hexToRgba('#FFFFFF', 0.45),
                        },
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.trayBtnLabel,
                      { color: actionColors ? actionColors.text : palette.text },
                    ]}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  accentStripe: {
    width: 5,
  },
  complianceDot: {
    position: 'absolute',
    top: 3,
    right: 4,
    zIndex: 1,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    paddingBottom: 2,
    paddingHorizontal: 7,
    gap: 1,
  },
  contentSqueezed: {
    paddingHorizontal: 4,
  },
  rowName: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 15,
  },
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  statusChipRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 12,
  },
  tray: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  trayBtn: {
    // Taller than the label needs → a larger tap target. The tray is anchored to
    // the bottom (see styles.tray `bottom`), so the extra height grows the button
    // UPWARD, keeping it flush to the bottom-right; TRAY_HEIGHT reserves room so
    // it never rides up over the text.
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBtnLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 13,
  },
});
