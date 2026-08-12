import { SymbolView } from 'expo-symbols';
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
// Layout rules — how the bar arranges its text + quick actions at a given size.
// Mirrors the web /dashboard/calendar bar design (PractitionerCalendarView +
// CompactBookingActions): SHORT bars lay the name and a height-tracked action
// row side by side so the name is never squeezed out; TALL bars stack text rows
// above a bottom-right action tray.
// ---------------------------------------------------------------------------

/**
 * Bars shorter than this use the horizontal row layout (web parity: the card
 * switches to its compact treatment below 56px of content height).
 */
const CORNER_MIN_HEIGHT = 56;
/**
 * Hard minimum width reserved for the guest name in the row layout — the name
 * must never be squeezed out by buttons (web COMPACT_NAME_RESERVE_PX).
 */
const NAME_RESERVE_PX = 58;
/**
 * Conservative width of one row-layout button incl. its gap. Buttons keep the
 * SAME label font + horizontal padding at every bar height (web corner-tray
 * rule: only the height compresses, never the width), so this matches the
 * corner tray's per-button budget.
 */
const ROW_PER_BUTTON_PX = 62;
/** Horizontal chrome in a bar the row layout can't use (accent stripe + paddings). */
const ROW_CHROME_PX = 20;
/**
 * Px budget per corner-tray button — label (≈7 chars at 11pt semibold),
 * horizontal padding and the inter-button gap.
 */
const TRAY_BUTTON_BUDGET_PX = 62;
/** Horizontal chrome inside a bar the corner tray can't use (accent stripe + offsets). */
const TRAY_CHROME_PX = 12;

/**
 * Reserved vertical space (px) below the text for the CORNER action tray. Must
 * track the tray's height (`bottom` offset + button {@link styles.trayBtn}
 * minHeight) so the bottom-anchored buttons never overlap the text above them.
 */
const TRAY_HEIGHT = 24;
/**
 * Below this bar height the quick actions are dropped entirely.
 *
 * A button has a hard 14px floor (its label's line box) and sits 2px off the
 * bar's bottom edge, so a shorter bar can only render it clipped by the card's
 * `overflow: 'hidden'` — and a half-cut control reads as broken, not compact.
 * Bars this short belong to sub-10-minute bookings, where the guest name alone
 * is the honest amount of information. The block still opens on tap.
 */
const ACTIONS_MIN_HEIGHT = 20;
/**
 * Vertical space a row-layout button must leave inside the bar: its 2px bottom
 * inset plus 4px of breathing room, so the button never touches the border.
 */
const ROW_BUTTON_INSET = 6;

export type BlockLayout = {
  /**
   * 'row'    — short bar: name (flex, truncating) beside a horizontal action
   *            row anchored to the bar's bottom edge (web compact bars).
   * 'corner' — tall bar: text rows above a bottom-right action tray.
   */
  mode: 'row' | 'corner';
  /** Rows of text to show: 1 = name[·time], 2 = +service, 3 = +time, 4 = +status. */
  rows: 1 | 2 | 3 | 4;
  /** How many quick-action buttons fit (0–2). */
  maxActions: 0 | 1 | 2;
  /**
   * Button height — tracks a short bar so buttons always fit inside it. The
   * label font and horizontal padding NEVER change with it (web rule: a short
   * bar compresses a button's height, never its width), so buttons stay the
   * same width as the normal-sized ones on taller bars.
   */
  buttonHeight: number;
  /** Guest-name size — shrinks only on the very short bars so it stays legible. */
  nameFontSize: number;
};

function clampActions(n: number): BlockLayout['maxActions'] {
  return Math.max(0, Math.min(2, n)) as BlockLayout['maxActions'];
}

/**
 * Decide the bar's layout from its height and the width available to it.
 *
 * SHORT bars (< {@link CORNER_MIN_HEIGHT}) mirror the web's compact bars: the
 * name and the action row are flex siblings, so the name always keeps at least
 * {@link NAME_RESERVE_PX} and yields the rest to buttons that are sized to the
 * bar's height — nothing ever overlaps or clips the name. Buttons that don't
 * fit the width budget are dropped (the caller keeps the TAIL of the action
 * list, so the primary transition survives, matching the web's omission rule).
 *
 * TALL bars keep the bottom-right corner tray; text rows are budgeted against
 * the tray's reserved height so a row never rides under the buttons.
 *
 * `widthPx` is the bar's true px width when the parent knows it (the
 * multi-calendar grid's columnWidth ÷ laneCount). When unknown (the
 * single-calendar grid's full-screen column) the overlap-lane count stands in,
 * mirroring the web's pre-measurement `narrow` hint.
 */
export function pickBlockLayout(params: {
  height: number;
  laneCount: number;
  widthPx?: number;
  /** Whether the block has any quick actions to place (callbacks + status). */
  hasActions?: boolean;
}): BlockLayout {
  const { height, laneCount, widthPx, hasActions = true } = params;

  if (height < CORNER_MIN_HEIGHT) {
    const maxActions =
      !hasActions || height < ACTIONS_MIN_HEIGHT
        ? 0
        : widthPx != null && widthPx > 0
          ? clampActions(Math.floor((widthPx - ROW_CHROME_PX - NAME_RESERVE_PX) / ROW_PER_BUTTON_PX))
          : laneCount > 1
            ? 1
            : 2;
    return {
      mode: 'row',
      rows: height >= 44 ? 2 : 1,
      maxActions,
      // Web parity: a hair shorter than the bar, floored so it never vanishes
      // and capped so it stays compact on the taller short bars. The inset keeps
      // the button clear of the bottom border — with `ACTIONS_MIN_HEIGHT` above,
      // the 14px floor can no longer exceed the space the bar actually has.
      buttonHeight: Math.max(14, Math.min(height - ROW_BUTTON_INSET, 22)),
      nameFontSize: height < 24 ? 10 : height < 32 ? 12 : 13,
    };
  }

  const maxActions = !hasActions
    ? 0
    : widthPx != null && widthPx > 0
      ? clampActions(Math.floor((widthPx - TRAY_CHROME_PX) / TRAY_BUTTON_BUDGET_PX))
      : laneCount >= 3
        ? 1
        : 2;
  // Text rows fit the space left above the tray (when one shows): name row
  // ≈16px, meta rows ≈14px, the status chip ≈20px, plus card padding.
  const avail = height - (maxActions > 0 ? TRAY_HEIGHT : 0);
  const rows: BlockLayout['rows'] = avail >= 72 ? 4 : avail >= 50 ? 3 : avail >= 36 ? 2 : 1;
  return {
    mode: 'corner',
    rows,
    maxActions,
    buttonHeight: 22,
    nameFontSize: 13,
  };
}

// ---------------------------------------------------------------------------
// Status action tray helpers — mirrors web quick-action buttons
// ---------------------------------------------------------------------------

/**
 * The "settled" marker on a calendar bar. A glyph, not a text pill: a
 * lane-split or compact bar can be only a few characters wide and the guest
 * name must keep its reserve. The block's accessibility label carries the word
 * "paid" so the meaning is not colour- or icon-only.
 */
function PaidGlyph({ color }: { color: string }) {
  return (
    <SymbolView
      name={{ ios: 'sterlingsign.circle.fill', android: 'paid', web: 'paid' }}
      tintColor={color}
      size={12}
    />
  );
}

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
 * The PRIMARY transition is always last, so slicing the tail keeps the most
 * important control when fewer buttons fit (web omission rule: the arrival
 * toggle / undo drops before Confirm/Start/Complete).
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

  const all = (() => {
    switch (status) {
      case 'Pending':
        // "Accept", matching BOOKING_PRIMARY_ACTIONS (web D9): the Confirm on a
        // Booked booking is the attendance action, and this one may be
        // accepting a booking whose deposit is still unpaid.
        return [arrivedToggle, { kind: 'status', status: 'Booked', label: 'Accept' } as TrayAction];
      case 'Booked':
      case 'Confirmed':
        return [arrivedToggle, { kind: 'status', status: 'Seated', label: 'Start' } as TrayAction];
      case 'Seated':
        return [
          { kind: 'status', status: 'Booked', label: 'Undo' } as TrayAction,
          { kind: 'status', status: 'Completed', label: 'Complete' } as TrayAction,
        ];
      case 'Completed':
        return [{ kind: 'status', status: 'Seated', label: 'Reopen' } as TrayAction];
      default:
        return [];
    }
  })();

  // Keep the tail — the primary transition is last (web keep-tail rule).
  return all.slice(Math.max(0, all.length - max));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  /**
   * Visual width (px) the card is being rendered at, when the parent knows it
   * (the multi-calendar grid's columnWidth ÷ laneCount). Budgets how many
   * actions fit; omitted → the full-screen-column lane heuristic.
   */
  widthPx?: number;
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
  /** Per-booking compliance flag — renders a small coloured dot. */
  complianceFlag?: ComplianceBookingFlag | null;
  /**
   * The visit is settled — renders a small "paid" glyph so staff can see at a
   * glance which of the day's appointments still need collecting.
   *
   * A glyph rather than a text pill because a lane-split or compact bar can be
   * only a few characters wide, and the guest name must never be squeezed out.
   */
  paid?: boolean;
};

/**
 * The visual card for one appointment on the day grid. Fills its parent
 * (positioning — top/height/lane left/width — is owned by the wrapper in
 * CalendarDayGrid), adapts its content to the space available, and renders
 * compact quick-status actions that never obscure the guest name.
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
  widthPx,
  laneIndex = 0,
  laneCount = 1,
  onPress,
  onStatusChange,
  onArrivalToggle,
  actionPending = false,
  complianceFlag,
  paid = false,
}: AppointmentBlockProps) {
  const palette = bookingCalendarBlockPalette({
    status,
    client_arrived_at: clientArrivedAt,
    staff_attendance_confirmed_at: staffAttendanceConfirmedAt,
    guest_attendance_confirmed_at: guestAttendanceConfirmedAt,
  });
  const arrivedWaiting = isArrivedWaitingDisplay({ status, client_arrived_at: clientArrivedAt });
  const statusLabel = `${bookingStatusDisplayLabel(status, false)}${arrivedWaiting ? ' · arrived' : ''}`;

  const squeezed = laneCount >= 2;
  const trayEnabled = !!(onStatusChange || onArrivalToggle);

  // Two-phase like the web: gather the block's full action set, size the layout
  // around whether any exist, then keep the tail that fits the width budget.
  const potentialActions = trayEnabled
    ? pickTrayActions({ status, clientArrivedAt, max: 2 })
    : [];
  const layout = pickBlockLayout({
    height,
    laneCount,
    widthPx,
    hasActions: potentialActions.length > 0,
  });
  const trayActions = potentialActions.slice(
    Math.max(0, potentialActions.length - layout.maxActions),
  );
  const showTray =
    trayActions.length > 0 || (trayEnabled && actionPending && layout.maxActions > 0);

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
  const nameStyle = [
    styles.rowName,
    {
      color: palette.text,
      fontSize: layout.nameFontSize,
      lineHeight: layout.nameFontSize + 3,
    },
  ];

  const renderTrayButtons = () =>
    actionPending ? (
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
              // Short bars compress the button's HEIGHT only (vertical padding
              // goes first); the label font + horizontal padding are identical
              // on every bar, so the button's WIDTH matches the normal-sized
              // buttons on taller bars (web rule).
              layout.mode === 'row'
                ? {
                    height: layout.buttonHeight,
                    minHeight: layout.buttonHeight,
                    paddingVertical: 0,
                  }
                : null,
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
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}, ${guestName}, ${serviceName}, ${statusLabel}${
        paid ? ', paid' : ''
      }`}
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

      {layout.mode === 'row' ? (
        // SHORT bar (web compact-bar parity): name (flex, truncating, centred)
        // beside the height-tracked action row. The name always keeps its
        // reserve — buttons that don't fit were already dropped by the layout.
        <View style={[styles.rowShell, squeezed && styles.contentSqueezed]}>
          <View style={styles.rowText} pointerEvents="none">
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={[nameStyle, styles.nameFlex]}>
                {guestName}
                {trayActions.length === 0 ? ` · ${timeLabel.split('–')[0]}` : ''}
              </Text>
              {paid ? <PaidGlyph color={subtleText} /> : null}
              {complianceFlag ? <ComplianceFlagDot flag={complianceFlag} /> : null}
            </View>
            {layout.rows >= 2 ? (
              <Text numberOfLines={1} style={[styles.rowMeta, { color: subtleText }]}>
                {serviceName || timeLabel}
              </Text>
            ) : null}
          </View>
          {showTray ? (
            <View style={styles.rowTray} onStartShouldSetResponder={() => true}>
              {renderTrayButtons()}
            </View>
          ) : null}
        </View>
      ) : (
        <>
          {/* Paid + compliance markers — top-right corner. */}
          {paid || complianceFlag ? (
            <View style={styles.complianceDot} pointerEvents="none">
              {paid ? <PaidGlyph color={subtleText} /> : null}
              {complianceFlag ? <ComplianceFlagDot flag={complianceFlag} /> : null}
            </View>
          ) : null}

          <View
            style={[
              styles.content,
              squeezed && styles.contentSqueezed,
              showTray && { paddingBottom: TRAY_HEIGHT },
            ]}
            pointerEvents="none">
            <Text numberOfLines={1} style={nameStyle}>
              {layout.rows === 1 ? `${guestName} · ${timeLabel.split('–')[0]}` : guestName}
            </Text>
            {layout.rows >= 2 ? (
              // Service name is prioritised over the time text: the bar's
              // position + height already encode when/how-long, so the service
              // is the more useful second line on a compact (2-row) block.
              <Text numberOfLines={1} style={[styles.rowMeta, { color: subtleText }]}>
                {serviceName || timeLabel}
              </Text>
            ) : null}
            {layout.rows >= 3 && serviceName ? (
              <Text numberOfLines={1} style={[styles.rowMeta, { color: subtleText }]}>
                {timeLabel}
              </Text>
            ) : null}
            {layout.rows >= 4 ? (
              <View style={styles.statusChipRow}>
                <View style={[styles.statusChip, { backgroundColor: hexToRgba('#FFFFFF', 0.9) }]}>
                  <View style={[styles.statusChipDot, { backgroundColor: palette.accent }]} />
                  <Text numberOfLines={1} style={[styles.statusChipLabel, { color: palette.accent }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Quick-status tray — bottom-right, compact, never overlaps content. */}
          {showTray ? (
            <View style={styles.tray} onStartShouldSetResponder={() => true}>
              {renderTrayButtons()}
            </View>
          ) : null}
        </>
      )}
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
    // Paid glyph and compliance dot can both be present; keep them side by side
    // rather than stacked on top of each other.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  // ---- Row layout (short bars) ----
  rowShell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 7,
    // Matches the corner tray's 4px right inset so buttons line up column-wide.
    paddingRight: 4,
    gap: 6,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameFlex: {
    flexShrink: 1,
    minWidth: 0,
  },
  rowTray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    // Anchor to the bar's bottom edge with the same 2px inset as the corner
    // tray, so buttons sit a consistent near-flush distance from the bottom of
    // every bar (centring them would make the gap grow with bar height).
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  // ---- Corner layout (tall bars) ----
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
    // Taller than the label needs → a larger tap target. In the corner tray the
    // extra height grows the button UPWARD (bottom-anchored); TRAY_HEIGHT
    // reserves room so it never rides up over the text. Row-layout buttons
    // override the height to track the bar (web compact parity).
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBtnLabel: {
    // Constant size on every bar — a button's width must never change with the
    // bar's height (web rule), so short-bar buttons match normal ones.
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 13,
  },
});
