/**
 * Card on file on the bookings list, rosters, diary and home (web Docs/card-on-file-plan.md §6.1,
 * §6.4, §6.5, §4.16): the Card filter, which bulk actions a selection allows, the "Select all"
 * count, and the upcoming range the home count and its "View" share.
 */
import { cardStateFromRow, staffCardStateLabel, type ApiCardState } from '@/lib/booking/card-hold';
import type { BadgeTone } from '@/components/ui/Badge';

/** The Card filter's choices, in the plan's order (§6.4). */
export const CARD_FILTER_OPTIONS: { key: ApiCardState; label: string }[] = [
  { key: 'waiting', label: 'Waiting for card' },
  { key: 'protected', label: 'Protected' },
  { key: 'not_needed', label: 'Card not needed' },
  { key: 'charged', label: 'Fee charged' },
];

/** The two states "Select all" and the bulk routes act on. */
export type CardBulkState = 'waiting' | 'not_needed';

export function isCardBulkState(state: ApiCardState | null | undefined): state is CardBulkState {
  return state === 'waiting' || state === 'not_needed';
}

type CardRow = { card_state?: unknown; deposit_status?: string | null };

/** How many rows have each card state (zero counts kept, so a chip can say 0). */
export function cardStateCounts(rows: readonly CardRow[]): Record<ApiCardState, number> {
  const out: Record<ApiCardState, number> = { waiting: 0, protected: 0, not_needed: 0, charged: 0 };
  for (const row of rows) {
    const state = cardStateFromRow(row);
    if (state) out[state] += 1;
  }
  return out;
}

/**
 * True when the server answers card states: some row carries a `card_state` key. An older server
 * sends none, so the Card filter and the home card stay hidden there.
 */
export function rowsCarryCardState(rows: readonly CardRow[]): boolean {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'card_state'));
}

/** What the ticked rows allow (plan §6.4): Confirm without a card needs a Waiting for card row. */
export function cardBulkAbilities(rows: readonly (CardRow & { id: string })[]): {
  waitingIds: string[];
  notNeededIds: string[];
  canConfirmWithoutCard: boolean;
  canSendCardRequests: boolean;
} {
  const waitingIds: string[] = [];
  const notNeededIds: string[] = [];
  for (const row of rows) {
    const state = cardStateFromRow(row);
    if (state === 'waiting') waitingIds.push(row.id);
    else if (state === 'not_needed') notNeededIds.push(row.id);
  }
  return {
    waitingIds,
    notNeededIds,
    canConfirmWithoutCard: waitingIds.length > 0,
    canSendCardRequests: waitingIds.length + notNeededIds.length > 0,
  };
}

/**
 * The n of "Select all {n} bookings": every booking row (not collapsed visits) of this business in
 * the dates, with the state. The server re-runs the same filter and answers a new count if it
 * differs.
 */
export function selectAllCardCount(
  rows: readonly (CardRow & { booking_date: string })[],
  state: CardBulkState,
  range: { from: string; to: string },
): number {
  return rows.filter(
    (row) => row.booking_date >= range.from && row.booking_date <= range.to && cardStateFromRow(row) === state,
  ).length;
}

/** "Select all 86 bookings". */
export function selectAllCardLabel(n: number): string {
  return `Select all ${n} booking${n === 1 ? '' : 's'}`;
}

/**
 * How far ahead the home count looks and its "View" lists. The plan counts every upcoming booking;
 * the server has no count of its own yet, so the app reads the list route this far ahead.
 */
export const CARD_UPCOMING_DAYS = 365;

/** Undo is offered until this moment (the server's `undo_until`, else 5 minutes from now). */
export function undoDeadlineMs(undoUntilIso: string | null | undefined, nowMs: number, windowMs: number): number {
  const parsed = undoUntilIso ? Date.parse(undoUntilIso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : nowMs + windowMs;
}

/** The badge tone for a card state pill: Waiting for card asks for attention, the rest are calm. */
export function cardStateBadgeTone(state: ApiCardState): BadgeTone {
  switch (state) {
    case 'waiting':
      return 'warning';
    case 'protected':
      return 'success';
    case 'charged':
      return 'brand';
    default:
      return 'neutral';
  }
}

/** The pill for a row, or null (no card hold, or nothing to say). */
export function rowCardPill(row: CardRow): { state: ApiCardState; label: string; tone: BadgeTone } | null {
  const state = cardStateFromRow(row);
  if (!state) return null;
  const label = staffCardStateLabel(state);
  return label ? { state, label, tone: cardStateBadgeTone(state) } : null;
}
