import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

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
import { useTheme } from '@/theme/useTheme';

// ---------------------------------------------------------------------------
// Layout rules — how the bar arranges its text + quick actions at a given size.
// Mirrors the web /dashboard/calendar bar design (PractitionerCalendarView +
// BookingCardInfo): a ONE-LINE bar lays the name and a height-tracked button
// side by side so the name is never squeezed out; taller bars stack text lines
// from the top beside a bottom-right action tray.
// ---------------------------------------------------------------------------

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
/**
 * The bar's edge chrome on each side, top and bottom: a 1px pale ring in the
 * grid's surface colour outside a 1px border in the status's deeper hue (the
 * web's `bookingCalendarBlockCardStyle`). Two bars of one status that touch,
 * or one drawn inside another's processing gap, share a hue and a border
 * colour, so their edges melted together; the ring keeps every bar's outline
 * readable against its neighbours. Not content area: the layout is sized to
 * what is left.
 */
const BAR_EDGE_PX = 2;
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
  /** Lines of text: 1 = "Name · Service", 2 = + service and time, 3 = each on its own line, 4 = + status. */
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

// ---------------------------------------------------------------------------
// Bar text (The Beauty Parlour, 2026-11-18, same rules as the web diary): one
// type style, 12px on a 15px line, the client's name semibold and every other
// line regular; one order, client, service, start to end time, then status;
// text 4px from the top, except a bar with room for one line, which centres it.
// ---------------------------------------------------------------------------

/** One line of bar text. */
export const BAR_LINE_PX = 15;
/** Where the first line starts below the bar's top edge. */
export const BAR_TEXT_TOP_PX = 4;
/** A line holding the status chip or the "Waiting for card" pill. */
const BAR_CHIP_LINE_PX = 20;
/** Horizontal room a bar's text cannot use: the edge chrome, the glass edge and the paddings. */
const BAR_TEXT_CHROME_PX = 16;
/** Text width assumed when the parent does not know the bar's width (a phone's single column). */
const DEFAULT_BAR_TEXT_PX = 300;
/** Average advance of one character of 12px Inter: semibold for the name, regular for the rest. */
const NAME_CHAR_PX = 6.9;
const META_CHAR_PX = 6.3;
/**
 * The least room worth giving a service that cannot fit whole. A service may end in
 * an ellipsis; a time is shown whole or not at all, because half a time reads as a
 * wrong one.
 */
const MIN_SERVICE_PX = 48;

/** Rough rendered width of a bar's text, for deciding what fits a line. */
export function estimateBarTextPx(text: string, kind: 'name' | 'meta'): number {
  return Math.ceil(Array.from(text).length * (kind === 'name' ? NAME_CHAR_PX : META_CHAR_PX));
}

/**
 * A client's name shortened to first name and surname initial ("Alexandra F."), for a
 * bar too narrow for the whole name: recognisable where "Alexandra Fitz…" is not.
 */
export function shortGuestName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  const initial = Array.from(parts[parts.length - 1]!)[0] ?? '';
  return `${parts[0]} ${initial.toLocaleUpperCase()}.`;
}

/** What a bar writes, line by line. */
export type BlockTextPlan = {
  /** The client's name, shortened when the whole name will not fit its line. */
  name: string;
  /** A one-line bar only: what follows the name on its line (" · Service", " · Service · 10:00–10:15"). */
  tail: string;
  /** The lines under the name, in order. A line holds a service, a time, or a service then a time. */
  lines: { service?: string; time?: string }[];
};

/**
 * The words a bar writes for its height and width. One line: "Name · Service", then
 * the start and end time if it fits whole. Two lines: the name, then the service and
 * the time (the service gives way, the time is kept whole or left off). Three or more:
 * the name, the service and the time, each on its own line.
 *
 * `lineWidthsPx[i]` is the text width of line `i` (0 = the name's line); a line beside
 * the button tray is narrower. A missing entry takes the last one given.
 */
export function planBlockText(params: {
  rows: number;
  guestName: string;
  serviceName?: string | null;
  /** "HH:mm–HH:mm". */
  timeLabel: string;
  lineWidthsPx: number[];
}): BlockTextPlan {
  const { rows, guestName, timeLabel, lineWidthsPx } = params;
  const service = params.serviceName?.trim() || '';
  const widthOf = (line: number) =>
    lineWidthsPx[Math.min(line, lineWidthsPx.length - 1)] ?? DEFAULT_BAR_TEXT_PX;
  const fullName = guestName.trim();
  const name =
    estimateBarTextPx(fullName, 'name') > widthOf(0) ? shortGuestName(fullName) : fullName;
  const nameWidth = estimateBarTextPx(name, 'name');

  if (rows <= 1) {
    let tail = service ? ` · ${service}` : '';
    const withTime = `${tail} · ${timeLabel}`;
    if (nameWidth + estimateBarTextPx(withTime, 'meta') <= widthOf(0)) tail = withTime;
    return { name, tail, lines: [] };
  }

  if (rows === 2) {
    if (!service) return { name, tail: '', lines: [{ time: timeLabel }] };
    const room = widthOf(1) - estimateBarTextPx(` · ${timeLabel}`, 'meta');
    return { name, tail: '', lines: [room >= MIN_SERVICE_PX ? { service, time: timeLabel } : { service }] };
  }

  return {
    name,
    tail: '',
    lines: service ? [{ service }, { time: timeLabel }] : [{ time: timeLabel }],
  };
}

function clampActions(n: number): BlockLayout['maxActions'] {
  return Math.max(0, Math.min(2, n)) as BlockLayout['maxActions'];
}

/**
 * Decide the bar's layout from its height and the width available to it.
 *
 * Lines come first (2026-11-18): a bar shows as many 15px lines as fit below its 4px
 * top inset, and a line may run beside the button tray (that line is narrower, not
 * gone). Two lines need 34px, three 49, and a fourth line, the status chip, 69.
 *
 * ONE-LINE bars use the row layout: "Name · Service" centred, beside a button sized
 * to the bar's height, so nothing overlaps or clips the name.
 *
 * Taller bars keep the bottom-right corner tray. A bar of one or two lines keeps one
 * button, the next step (the caller keeps the TAIL of the action list, so the primary
 * transition survives, as on the web); taller bars keep both where the width allows.
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
  const widthKnown = widthPx != null && widthPx > 0;
  const textLines = (lines: number) => BAR_TEXT_TOP_PX + lines * BAR_LINE_PX;
  const rows: BlockLayout['rows'] =
    height >= textLines(3) + BAR_CHIP_LINE_PX ? 4 : height >= textLines(3) ? 3 : height >= textLines(2) ? 2 : 1;

  if (rows === 1) {
    const maxActions =
      !hasActions || height < ACTIONS_MIN_HEIGHT
        ? 0
        : widthKnown
          ? clampActions(Math.min(1, Math.floor((widthPx - ROW_CHROME_PX - NAME_RESERVE_PX) / ROW_PER_BUTTON_PX)))
          : 1;
    return {
      mode: 'row',
      rows,
      maxActions,
      // Web parity: a hair shorter than the bar, floored so it never vanishes
      // and capped so it stays compact on the taller short bars. The inset keeps
      // the button clear of the bottom border — with `ACTIONS_MIN_HEIGHT` above,
      // the 14px floor can no longer exceed the space the bar actually has.
      buttonHeight: Math.max(14, Math.min(height - ROW_BUTTON_INSET, 22)),
      nameFontSize: height < BAR_LINE_PX ? 11 : 12,
    };
  }

  const widthBudget = widthKnown
    ? clampActions(Math.floor((widthPx - TRAY_CHROME_PX) / TRAY_BUTTON_BUDGET_PX))
    : laneCount >= 3
      ? 1
      : 2;
  const maxActions = !hasActions ? 0 : rows === 2 ? clampActions(Math.min(1, widthBudget)) : widthBudget;
  return {
    mode: 'corner',
    rows,
    maxActions,
    // A two-line bar's button is a little shorter, so it sits beside the second line.
    buttonHeight: rows === 2 ? 20 : 22,
    nameFontSize: 12,
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
/**
 * "1/2" — one service of a multi-service visit (web #187 `VisitChip`, wording
 * from web #189). The bare fraction is for the eye; a screen reader gets the
 * sentence.
 */
export function VisitChip({ label, color }: { label: string; color: string }) {
  const [index, count] = label.split('/');
  const accessibilityLabel =
    index && count ? `Service ${index} of ${count} in this visit` : label;
  return (
    <View style={styles.visitChip} testID="visit-chip" accessibilityLabel={accessibilityLabel}>
      <Text numberOfLines={1} style={[styles.visitChipText, { color }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Card on file (web card-on-file-plan §6.1): the bar's only card marker, for a booking still
 * waiting for a card. A glyph on a bar too short for words; the bar's own label says it to
 * screen readers.
 */
export const WAITING_FOR_CARD_LABEL = 'Waiting for card';

function WaitingCardGlyph({ color }: { color: string }) {
  return (
    <View testID="waiting-card-glyph" accessibilityLabel={WAITING_FOR_CARD_LABEL}>
      <SymbolView
        name={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }}
        tintColor={color}
        size={12}
      />
    </View>
  );
}

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
  /**
   * Card on file (plan §6.1): the booking waits for a card. A tall bar says "Waiting for card"
   * in a small pill; a short one shows a card glyph. Protected and Card not needed show nothing.
   */
  waitingForCard?: boolean;
  /**
   * This bar rides inside another bar's processing gap (web #177). Since web
   * #184 it looks like any other booking (full lane, ordinary radius); the flag
   * only lifts it above its host.
   */
  nested?: boolean;
  /**
   * "1/2": this bar is one service of a multi-service visit (web #187, #189).
   * The visit's services are independent bars, each in its own status colour;
   * the chip and the seam spines are what say they belong together.
   */
  visitChip?: string | null;
  /** A sibling of the visit meets this bar edge to edge at the top / bottom. */
  spineTop?: boolean;
  spineBottom?: boolean;
  /**
   * The status whose colour the bar takes when it is not its own: a visit's
   * services all wear the earliest service's colour. The tray and the label
   * still read `status`.
   */
  paletteStatus?: string | null;
  /**
   * The stretches the bar PAINTS, as px bands from its top (web #185,
   * `BookingBarPieces`): one rounded lozenge per busy stretch, each with the
   * full card finish, so processing time in the middle of the appointment,
   * the free foot where processing runs to the end, and the wait between a
   * visit's services are gaps the grid shows through, and the boundary either
   * side of them looks exactly like the end of any booking bar. Omitted: one
   * piece, the whole bar.
   */
  pieces?: readonly { top: number; height: number }[];
  /**
   * The services of a visit after the first, each with its px band from the
   * bar's top (its busy stretch) and its own labels: the guest's name, the
   * service and the time are written on every block of service time where
   * the space allows, so a later service in a visit reads like a booking of
   * its own. The first service keeps the card's main text.
   */
  segments?: readonly {
    top: number;
    height: number;
    serviceName: string;
    timeLabel: string;
  }[];
  /**
   * The parts of those holes a tap should treat as empty grid: pressing one
   * calls `onFreePress` with the wall-clock minute under the finger (snapped
   * down to five minutes) rather than opening the booking.
   */
  freeTaps?: readonly { top: number; height: number; startMinute: number; endMinute: number }[];
  onFreePress?: (wallMinute: number) => void;
  /**
   * The booking's turnover, drawn as a hatched "Buffer" band under the bar: px
   * from the bar's top (after any processing that runs past the end) and its
   * height. Nothing can be booked into it; it takes no touches.
   */
  bufferBand?: { top: number; height: number } | null;
  /**
   * When nested bars or the bar's own free bands cover parts of this bar, the
   * px region (from its top) the text and buttons keep to. Omitted: the whole
   * bar.
   */
  contentInset?: { top: number; height: number } | null;
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
  waitingForCard = false,
  pieces,
  segments,
  freeTaps,
  onFreePress,
  bufferBand,
  contentInset,
  visitChip,
  spineTop,
  spineBottom,
  paletteStatus,
}: AppointmentBlockProps) {
  const { colors } = useTheme();
  const palette = bookingCalendarBlockPalette({
    status: paletteStatus ?? status,
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
  // A host lays its text and buttons out in the region its nested bars leave
  // (the tray moves up with them; the corner markers follow the region's top).
  // Less the edge chrome, which the content cannot use (see `BAR_EDGE_PX`).
  const contentHeight = (contentInset ? contentInset.height : height) - 2 * BAR_EDGE_PX;
  const layout = pickBlockLayout({
    height: contentHeight,
    laneCount,
    widthPx,
    hasActions: potentialActions.length > 0,
  });
  const insetStyle = contentInset
    ? { alignSelf: 'flex-start' as const, marginTop: contentInset.top, height: contentInset.height }
    : null;
  const trayInsetStyle = contentInset
    ? { bottom: 2 + Math.max(0, height - contentInset.top - contentInset.height) }
    : null;
  const trayActions = potentialActions.slice(
    Math.max(0, potentialActions.length - layout.maxActions),
  );
  // The pending case no longer needs its own clause: the buttons stay rendered
  // while a write is in flight, so there is no spinner to reserve a row for.
  const showTray = trayActions.length > 0;

  // What fits each line. A line running beside the bottom-right tray is narrower by the
  // tray's width; the name's line also gives up room to its markers (visit, paid, card,
  // forms), which sit after the name so every name starts at the same edge.
  const trayWidthPx =
    trayActions.length * (layout.mode === 'row' ? ROW_PER_BUTTON_PX : TRAY_BUTTON_BUDGET_PX);
  const barTextPx = (widthPx != null && widthPx > 0 ? widthPx : DEFAULT_BAR_TEXT_PX) - BAR_TEXT_CHROME_PX;
  const showCardPill = waitingForCard && layout.rows >= 4;
  const markerPx =
    (visitChip ? 28 : 0) + (paid ? 16 : 0) + (waitingForCard && !showCardPill ? 16 : 0) + (complianceFlag ? 14 : 0);
  const trayTopPx = contentHeight - 2 - layout.buttonHeight;
  const besideTray = (line: number, lineHeight: number = BAR_LINE_PX) =>
    showTray && layout.mode === 'corner' && BAR_TEXT_TOP_PX + line * BAR_LINE_PX + lineHeight > trayTopPx;
  const lineWidthsPx =
    layout.mode === 'row'
      ? [barTextPx - trayWidthPx - markerPx]
      : [0, 1, 2].map((line) => barTextPx - (line === 0 ? markerPx : 0) - (besideTray(line) ? trayWidthPx : 0));
  const textPlan = planBlockText({ rows: layout.rows, guestName, serviceName, timeLabel, lineWidthsPx });
  const trayClearance = (line: number, lineHeight?: number) =>
    besideTray(line, lineHeight) ? { paddingRight: trayWidthPx } : null;

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

  // 0.9: the details are regular weight now, so they need the stronger tone to read at 12px.
  const subtleText = hexToRgba(palette.text, 0.9);
  const nameStyle = [
    styles.rowName,
    {
      color: palette.text,
      fontSize: layout.nameFontSize,
      lineHeight: layout.nameFontSize >= 12 ? BAR_LINE_PX : 13,
    },
  ];
  /** Markers after the name, in the same place on every bar (web parity). */
  const nameMarkers = (
    <>
      {visitChip ? <VisitChip label={visitChip} color={palette.text} /> : null}
      {paid ? <PaidGlyph color={subtleText} /> : null}
      {waitingForCard && !showCardPill ? <WaitingCardGlyph color={subtleText} /> : null}
      {complianceFlag ? <ComplianceFlagDot flag={complianceFlag} /> : null}
    </>
  );
  /** `firstLine`: the line index the first of `lines` sits on, for the tray clearance; null = none. */
  const renderPlanLines = (lines: BlockTextPlan['lines'], firstLine: number | null) =>
    lines.map((line, i) => (
      <View key={i} style={[styles.metaLine, firstLine == null ? null : trayClearance(firstLine + i)]}>
        {line.service ? (
          <Text numberOfLines={1} style={[styles.rowMeta, styles.metaShrink, { color: subtleText }]}>
            {line.service}
          </Text>
        ) : null}
        {line.time ? (
          <Text numberOfLines={1} style={[styles.rowMeta, styles.metaFixed, { color: subtleText }]}>
            {line.service ? ` · ${line.time}` : line.time}
          </Text>
        ) : null}
      </View>
    ));

  /**
   * The buttons stay put while a write is in flight — dimmed and inert, never
   * swapped for a spinner.
   *
   * Replacing them read as "wait": the controls vanished for the whole round
   * trip, and on a multi-service bar for as long as its slowest segment. The bar
   * already shows the new status the moment it is pressed (the grid cache is
   * patched optimistically in the calendar screen), so the honest signal is a
   * settling control, not a missing one.
   */
  const renderTrayButtons = () =>
    trayActions.map((action) => {
      const actionColors = trayActionColors(action);
      return (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: actionPending }}
          disabled={actionPending}
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
            layout.buttonHeight < 22
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
            // Settling, not gone. Sits last so it wins over the pressed opacity.
            actionPending ? styles.trayBtnPending : null,
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
    });

  return (
    // The pale ring: the grid's surface colour drawn as a hairline outside the
    // bar's own border, so touching bars of one hue stay two bars.
    <View testID="bar-ring" style={styles.ring}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}, ${guestName}, ${serviceName}, ${statusLabel}${
        paid ? ', paid' : ''
      }${waitingForCard ? `, ${WAITING_FOR_CARD_LABEL}` : ''}`}
      accessibilityHint="Tap to open. Touch and hold to move."
      onPress={() => onPress(id)}
      style={({ pressed }) => [styles.block, { opacity: pressed ? 0.85 : 1 }]}>
      {/* The paint: one rounded lozenge per busy stretch, each with the full
          card finish (fill, border, the pale ring outside it, the glass edge
          on the left, the gloss top and grounded base), so the boundary either
          side of a processing gap or a visit's wait looks exactly like the end
          of any booking bar and the diary shows through between them (web
          #185, `BookingBarPieces`). The box itself paints nothing. */}
      {(pieces && pieces.length > 0 ? pieces : [{ top: 0, height }]).map((piece, index) => (
        <View
          key={index}
          pointerEvents="none"
          testID="bar-piece"
          style={[
            styles.pieceRing,
            { top: piece.top, height: piece.height, borderColor: hexToRgba(colors.background, 0.9) },
          ]}>
          <View
            testID="bar-piece-card"
            style={[styles.piece, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            {/* Leading edge (web parity: `CalendarBookingStatusStripe`). The
                bold fill carries the status, so this is a luminous glass edge
                that catches the light down the bar, not a second colour. */}
            <View style={[styles.accentStripe, { backgroundColor: hexToRgba('#FFFFFF', 0.28) }]} />
            <View
              testID="bar-gloss"
              style={[styles.glossTop, { backgroundColor: hexToRgba('#FFFFFF', 0.3) }]}
            />
            <View style={[styles.glossBase, { backgroundColor: hexToRgba('#000000', 0.12) }]} />
          </View>
        </View>
      ))}

      {/* Seams with the visit's siblings (web #187): a short spine in the
          visit's accent across each edge where two of its bars touch. */}
      {spineTop ? (
        <View
          testID="visit-spine-top"
          pointerEvents="none"
          style={[styles.spine, styles.spineTop, { backgroundColor: palette.accent }]}
        />
      ) : null}
      {spineBottom ? (
        <View
          testID="visit-spine-bottom"
          pointerEvents="none"
          style={[styles.spine, styles.spineBottom, { backgroundColor: palette.accent }]}
        />
      ) : null}

      {layout.mode === 'row' ? (
        // SHORT bar (web compact-bar parity): name (flex, truncating, centred)
        // beside the height-tracked action row. The name always keeps its
        // reserve — buttons that don't fit were already dropped by the layout.
        <View style={[styles.rowShell, squeezed && styles.contentSqueezed, insetStyle]}>
          <View style={styles.rowText} pointerEvents="none">
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={[nameStyle, styles.nameFlex]}>
                {textPlan.name}
                {textPlan.tail ? (
                  <Text style={[styles.inlineMeta, { color: subtleText }]}>{textPlan.tail}</Text>
                ) : null}
              </Text>
              {nameMarkers}
            </View>
          </View>
          {showTray ? (
            <View style={styles.rowTray} onStartShouldSetResponder={() => true}>
              {renderTrayButtons()}
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <View style={[styles.content, squeezed && styles.contentSqueezed, insetStyle]} pointerEvents="none">
            <View style={[styles.nameRow, trayClearance(0)]}>
              <Text numberOfLines={1} style={[nameStyle, styles.nameFlex]}>
                {textPlan.name}
              </Text>
              {nameMarkers}
            </View>
            {renderPlanLines(textPlan.lines, 1)}
            {/* The fourth line: "Waiting for card" when the booking waits for one (the more
                useful thing to say), otherwise the status. */}
            {showCardPill ? (
              <View
                style={[styles.statusChipRow, trayClearance(1 + textPlan.lines.length, BAR_CHIP_LINE_PX)]}
                testID="waiting-card-pill">
                <View style={[styles.statusChip, { backgroundColor: hexToRgba('#FFFFFF', 0.9) }]}>
                  <Text numberOfLines={1} style={[styles.statusChipLabel, { color: '#92400E' }]}>
                    {WAITING_FOR_CARD_LABEL}
                  </Text>
                </View>
              </View>
            ) : null}
            {layout.rows >= 4 && !showCardPill ? (
              <View style={[styles.statusChipRow, trayClearance(1 + textPlan.lines.length, BAR_CHIP_LINE_PX)]}>
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
            <View style={[styles.tray, trayInsetStyle]} onStartShouldSetResponder={() => true}>
              {renderTrayButtons()}
            </View>
          ) : null}
        </>
      )}

      {/* Every later service of a visit is labelled on its own block of
          service time (web #185): the guest's name, the service and the time,
          as many rows as the block's height allows, so a service after a wait
          reads like a booking of its own rather than an unmarked stretch. */}
      {segments?.map((segment, index) => {
        const rows = segmentLabelRows(segment.height);
        if (rows === 0) return null;
        const segmentPlan = planBlockText({
          rows,
          guestName,
          serviceName: segment.serviceName,
          timeLabel: segment.timeLabel,
          lineWidthsPx: [barTextPx],
        });
        return (
          <View
            key={index}
            pointerEvents="none"
            testID="segment-label"
            style={[
              styles.segmentLabel,
              squeezed && styles.contentSqueezed,
              { top: segment.top, height: segment.height },
            ]}>
            <Text
              numberOfLines={1}
              style={[
                styles.rowName,
                { color: palette.text, fontSize: 12, lineHeight: BAR_LINE_PX },
              ]}>
              {segmentPlan.name}
              {segmentPlan.tail ? (
                <Text style={[styles.inlineMeta, { color: subtleText }]}>{segmentPlan.tail}</Text>
              ) : null}
            </Text>
            {renderPlanLines(segmentPlan.lines, null)}
          </View>
        );
      })}

      {/* The bookable part of each hole takes the tap itself, so booking
          someone else into a colour's developing time is the same gesture as
          tapping empty grid, and never opens this booking (web #185). */}
      {onFreePress
        ? freeTaps?.map((tap, index) => (
            <Pressable
              key={index}
              testID="processing-free-tap"
              accessibilityRole="button"
              accessibilityLabel={`Free from ${minuteLabel(tap.startMinute)} to ${minuteLabel(
                tap.endMinute,
              )}: tap to book`}
              onPress={(event) => {
                const y = event.nativeEvent.locationY;
                const frac = tap.height > 0 ? Math.max(0, Math.min(1, y / tap.height)) : 0;
                const minute = tap.startMinute + frac * (tap.endMinute - tap.startMinute);
                onFreePress(Math.max(tap.startMinute, Math.floor(minute / 5) * 5));
              }}
              style={({ pressed }) => [
                styles.freeTap,
                { top: tap.top, height: tap.height },
                pressed ? { backgroundColor: hexToRgba(palette.accent, 0.12) } : null,
              ]}
            />
          ))
        : null}
    </Pressable>

    {/* Turnover after the service (and after any processing that runs past
        it): hatched, labelled, untouchable. It was invisible before, so staff
        saw empty grid they could not book into (web #185). */}
    {bufferBand && bufferBand.height > 0 ? (
      <View
        pointerEvents="none"
        testID="buffer-band"
        style={[
          styles.bufferBand,
          {
            top: bufferBand.top,
            height: bufferBand.height,
            backgroundColor: hexToRgba(colors.text, 0.08),
            borderColor: hexToRgba(colors.text, 0.28),
          },
        ]}>
        {bufferBand.height >= 14 ? (
          <Text numberOfLines={1} style={[styles.bufferLabel, { color: colors.textMuted }]}>
            Buffer
          </Text>
        ) : null}
      </View>
    ) : null}
    </View>
  );
}

/**
 * How many text lines a later service's block of service time can hold, on the
 * bar's 15px lines below a 3px inset: "Name · Service" from 15px, the name then
 * the service and time from 33px, each on its own line from 48px. Below 15px
 * nothing is written; the piece's colour is the honest amount of information.
 */
export function segmentLabelRows(heightPx: number): 0 | 1 | 2 | 3 {
  if (heightPx >= 3 + 3 * BAR_LINE_PX) return 3;
  if (heightPx >= 3 + 2 * BAR_LINE_PX) return 2;
  if (heightPx >= BAR_LINE_PX) return 1;
  return 0;
}

/** "HH:mm" for a wall-clock minute, for the free-tap accessibility label. */
function minuteLabel(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  // The bar's box paints nothing (the pieces do); it keeps the layout and
  // clips the content to the bar.
  ring: {
    flex: 1,
  },
  block: {
    flex: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  // One busy stretch: the pale ring in the grid's surface colour outside the
  // card's own border, both rounded, so every lozenge end reads as a bar end.
  pieceRing: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: radius.md + 1,
    borderWidth: 1,
  },
  piece: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  segmentLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingTop: 3,
    paddingHorizontal: 7,
    overflow: 'hidden',
    zIndex: 2,
  },
  glossTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  glossBase: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  freeTap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
  },
  bufferBand: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    overflow: 'hidden',
    paddingHorizontal: 6,
    justifyContent: 'flex-start',
  },
  bufferLabel: {
    fontFamily: fonts.semibold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  accentStripe: {
    width: 5,
  },
  // "1/2" on one service of a visit (web #187, `VisitChip`): a small
  // translucent pill ahead of the name, in the bar's own text colour.
  visitChip: {
    flexShrink: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  visitChipText: {
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  // A short spine across the seam where this bar meets a sibling of its visit
  // edge to edge, so two touching bars read as one booking without merging.
  spine: {
    position: 'absolute',
    left: '38%',
    right: '38%',
    height: 3,
    borderRadius: 2,
    zIndex: 3,
  },
  spineTop: { top: -1 },
  spineBottom: { bottom: -1 },
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
    paddingTop: BAR_TEXT_TOP_PX,
    paddingBottom: 2,
    paddingHorizontal: 7,
  },
  contentSqueezed: {
    paddingHorizontal: 4,
  },
  rowName: {
    fontFamily: fonts.semibold,
  },
  // One type style with the name: 12px on a 15px line (web parity, 2026-11-18).
  rowMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: BAR_LINE_PX,
    fontVariant: ['tabular-nums'],
  },
  /** The rest of a one-line bar after the name: same size, regular weight. */
  inlineMeta: {
    fontFamily: fonts.regular,
  },
  /** A line under the name: a service that may give way, then a time that never does. */
  metaLine: {
    flexDirection: 'row',
    minWidth: 0,
  },
  metaShrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  metaFixed: {
    flexShrink: 0,
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
    // extra height grows the button UPWARD (bottom-anchored); text lines beside
    // it keep clear by its width (`trayClearance`). Short bars override the
    // height to track the bar (web compact parity).
    minHeight: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayBtnPending: {
    // Dimmed while the write is in flight. Enough to read as "working" without
    // taking the control off the bar.
    opacity: 0.45,
  },
  trayBtnLabel: {
    // Constant size on every bar — a button's width must never change with the
    // bar's height (web rule), so short-bar buttons match normal ones.
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 13,
  },
});
