/**
 * Card-hold deposits: staff UI state, copy, and helpers.
 *
 * Consolidated port of the web modules (kept in web order so parity diffs stay
 * mechanical):
 *  - (web repo) src/lib/booking/card-hold-terms.ts (fee formatting)
 *  - (web repo) src/components/booking/card-hold-copy.ts (staff strings)
 *  - (web repo) src/components/booking/card-hold-ui-state.ts (state machine)
 *  - (web repo) src/components/booking/staff-card-hold.ts (create-form toggle)
 *
 * Docs: CARD_HOLD_DEPOSITS_DESIGN_AND_IMPLEMENTATION §9.1 state table, §9.2
 * charge gate, §7.6/D6 staff toggle. No em-dashes anywhere in this copy.
 */

import { formatPence } from '@/lib/format';

/* ------------------------------------------------------------------ */
/* Fee formatting (card-hold-terms.ts)                                 */
/* ------------------------------------------------------------------ */

/** £X.XX from pence, e.g. 2500 -> "£25.00" ("€25.00" for a euro business). */
export function formatCardHoldFeePence(feePence: number): string {
  return formatPence(Number(feePence)) ?? '';
}

/* ------------------------------------------------------------------ */
/* Card on file words (card-on-file-plan §4.1, §6.1)                   */
/* ------------------------------------------------------------------ */

/**
 * The `card_state` the server answers on list rows, calendar feeds and the
 * booking GET (web `src/lib/cards-on-file/hold-state.ts` `ApiCardState`).
 */
export type ApiCardState = 'protected' | 'waiting' | 'not_needed' | 'charged';

/** The four staff words for a card-hold booking (plan §4.1). */
export const CARD_STATE_PROTECTED = 'Protected';
export const CARD_STATE_WAITING = 'Waiting for card';
export const CARD_STATE_NOT_NEEDED = 'Card not needed';
export const CARD_STATE_FEE_CHARGED = 'Fee charged';

export type StaffCardStateLabel =
  | typeof CARD_STATE_PROTECTED
  | typeof CARD_STATE_WAITING
  | typeof CARD_STATE_NOT_NEEDED
  | typeof CARD_STATE_FEE_CHARGED;

/** Every `card_state` value, in the order the Card filter lists them (plan §6.4). */
export const API_CARD_STATES: readonly ApiCardState[] = ['waiting', 'protected', 'not_needed', 'charged'];

/** Narrow an unknown value (older servers send nothing) to an `ApiCardState`. */
export function parseApiCardState(value: unknown): ApiCardState | null {
  return typeof value === 'string' && (API_CARD_STATES as readonly string[]).includes(value)
    ? (value as ApiCardState)
    : null;
}

/** The staff pill words for a `card_state` (web `staffCardStateLabel`); null shows nothing. */
export function staffCardStateLabel(state: ApiCardState | string | null | undefined): StaffCardStateLabel | null {
  switch (state) {
    case 'protected':
      return CARD_STATE_PROTECTED;
    case 'waiting':
      return CARD_STATE_WAITING;
    case 'not_needed':
      return CARD_STATE_NOT_NEEDED;
    case 'charged':
      return CARD_STATE_FEE_CHARGED;
    default:
      return null;
  }
}

export type CardHoldPillVariant = 'warning' | 'info' | 'neutral' | 'brand';

/**
 * The pill for a `card_state` on lists, rosters and the day sheet (plan §6.1):
 * text, never colour alone. Waiting for card is the only one that asks for
 * attention.
 */
export function cardStatePill(
  state: ApiCardState | string | null | undefined,
): { label: StaffCardStateLabel; variant: CardHoldPillVariant } | null {
  const label = staffCardStateLabel(state);
  if (!label) return null;
  const variant: CardHoldPillVariant =
    state === 'waiting' ? 'warning' : state === 'protected' ? 'info' : state === 'charged' ? 'brand' : 'neutral';
  return { label, variant };
}

/**
 * The `card_state` for a row when the server sent none (an older server, or a
 * payload without the field), from `deposit_status` alone. Conservative: a
 * Pending deposit on a row with no hold flag cannot be told from a money
 * deposit, so only the hold-only enum values map.
 */
export function cardStateFromRow(row: {
  card_state?: unknown;
  deposit_status?: string | null;
}): ApiCardState | null {
  const parsed = parseApiCardState(row.card_state);
  if (parsed) return parsed;
  if (row.card_state === null) return null;
  if (row.deposit_status === 'Card Held') return 'protected';
  if (row.deposit_status === 'Charged') return 'charged';
  return null;
}

/** "Visa ending 4242" (web `cardLabel`): brand capitalised; "Card" when unknown. */
export function cardLabel(brand: string | null | undefined, last4: string | null | undefined): string {
  const names: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
    maestro: 'Maestro',
  };
  const b = (brand ?? '').toLowerCase();
  const name = names[b] ?? (b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card');
  return last4 ? `${name} ending ${last4}` : name;
}

/** "08/28" (web `cardExpiry`), or null when unknown. */
export function cardExpiry(
  expMonth: number | null | undefined,
  expYear: number | null | undefined,
): string | null {
  if (!expMonth || !expYear) return null;
  return `${String(expMonth).padStart(2, '0')}/${String(expYear).slice(-2)}`;
}

/**
 * True when the card's last valid day is before the booking date (C7). Cards
 * are valid to the end of their expiry month.
 */
export function cardExpiresBefore(
  expMonth: number | null | undefined,
  expYear: number | null | undefined,
  bookingDate: string | null | undefined,
): boolean {
  if (!expMonth || !expYear || !bookingDate) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bookingDate);
  if (!m) return false;
  const year = expYear < 100 ? 2000 + expYear : expYear;
  const bookingKey = Number(m[1]) * 12 + (Number(m[2]) - 1);
  const expiryKey = year * 12 + (expMonth - 1);
  return bookingKey > expiryKey;
}

/* ------------------------------------------------------------------ */
/* Staff copy (card-hold-copy.ts, staff half, card-on-file words)      */
/* ------------------------------------------------------------------ */

/** Pill labels (plan §6.1). The ended and refunded pills are detail-only. */
export const CARD_HOLD_PILL_WAITING = CARD_STATE_WAITING;
export const CARD_HOLD_PILL_PROTECTED = CARD_STATE_PROTECTED;
export const CARD_HOLD_PILL_NOT_NEEDED = CARD_STATE_NOT_NEEDED;
export const CARD_HOLD_PILL_CHARGED = CARD_STATE_FEE_CHARGED;
export const CARD_HOLD_PILL_ENDED = 'Protection ended';
export const CARD_HOLD_PILL_REFUNDED = 'Fee refunded';
/** @deprecated Older words; kept for callers not yet moved. Reads "Waiting for card". */
export const CARD_HOLD_PILL_REQUEST_SENT = CARD_HOLD_PILL_WAITING;
/** @deprecated Older words; kept for callers not yet moved. Reads "Protected". */
export const CARD_HOLD_PILL_HELD = CARD_HOLD_PILL_PROTECTED;

/** Staff action labels (plan §6.3, §6.8). */
export const CARD_SEND_REQUEST_LABEL = 'Send card request';
export const CARD_ADD_NOW_LABEL = 'Add card now';
export const CARD_CONFIRM_WITHOUT_LABEL = 'Confirm without a card';
export const CARD_HOLD_CHARGE_ACTION_LABEL = 'Charge no-show fee';
export const CARD_HOLD_CHARGE_FEES_LABEL = 'Charge no-show fees';
export const CARD_HOLD_REFUND_ACTION_LABEL = 'Refund no-show fee';
export const CARD_HOLD_RELEASE_ACTION_LABEL = 'Release card hold';
/** @deprecated Use {@link CARD_SEND_REQUEST_LABEL}. */
export const CARD_HOLD_RESEND_LINK_LABEL = CARD_SEND_REQUEST_LABEL;
/** @deprecated Use {@link CARD_CONFIRM_WITHOUT_LABEL}. */
export const CARD_HOLD_WAIVE_LABEL = CARD_CONFIRM_WITHOUT_LABEL;

/** Short date used in staff hold detail lines, e.g. "3 Jul 2026". */
export function formatCardHoldDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "12 November, 14:30" for the tick's deadline. */
function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

function feeSentence(feePence: number | null | undefined): string | null {
  return feePence != null && feePence > 0 ? `No-show fee up to ${formatCardHoldFeePence(feePence)}.` : null;
}

/** Waiting for card (plan §6.3). */
export function cardWaitingLine(): string {
  return 'Waiting for card. A card request was sent to the client.';
}

/** Under Waiting for card when "Cancel if no card" was ticked (plan §4.9). */
export function cardCancelIfNoCardLine(cancelIfNoCardAtIso: string): string {
  return `The booking is cancelled if no card is added by ${formatDeadline(cancelIfNoCardAtIso)}.`;
}

/** Card not needed (plan §6.3). */
export const CARD_NOT_NEEDED_LINE =
  'Card not needed for this booking. The client can still add one before the appointment.';

/** Not you (plan §6.3, C4). */
export const CARD_NOT_YOU_LINE =
  "The client said this booking wasn't made by them. It is no longer protected.";

/** Expiring card (plan §6.3, C7). */
export const CARD_EXPIRES_BEFORE_LINE =
  'The card expires before this booking. The client has been asked to update it.';

/** `'Pending'` + released hold (booking cancelled before a card was added). */
export const CARD_HOLD_REQUEST_CANCELLED_LINE = 'The card request was cancelled with the booking.';

/** @deprecated Older words; a waived request now reads {@link CARD_NOT_NEEDED_LINE}. */
export const CARD_HOLD_WAIVED_LINE = CARD_NOT_NEEDED_LINE;

/** The card the hold uses (`card_hold.card` on the booking GET, plan §10). */
export interface CardHoldCard {
  kind: 'card_on_file' | 'till_card';
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  cardholder_name: string | null;
  scope: string | null;
  status: string | null;
  /** "Saved with {name}" when a server sends it (not today). */
  saved_with?: string | null;
}

/**
 * Protected (plan §6.3): "Protected by card on file. Visa ending 4242, saved
 * with The Beauty Parlour. No-show fee up to £10." The saved-with clause is
 * shown when the payload names it; a till card and a legacy per-booking card
 * say where they came from instead.
 */
export function cardProtectedLine(input: {
  source?: string | null;
  card?: CardHoldCard | null;
  feePence: number | null | undefined;
}): string {
  const fee = feeSentence(input.feePence);
  const card = input.card ?? null;
  const label = card && (card.brand || card.last4) ? cardLabel(card.brand, card.last4) : null;
  let first: string;
  if (input.source === 'till_card' || card?.kind === 'till_card') {
    first = label ? `Protected by a card saved at the till. ${label}.` : 'Protected by a card saved at the till.';
  } else if (input.source === 'card_on_file' || card?.kind === 'card_on_file') {
    const savedWith = card?.saved_with ? `, saved with ${card.saved_with}` : '';
    first = label ? `Protected by card on file. ${label}${savedWith}.` : 'Protected by card on file.';
  } else {
    // A legacy per-booking hold, or a payload without the new fields.
    first = 'Protected by a card saved for this booking.';
  }
  return fee ? `${first} ${fee}` : first;
}

/** @deprecated Older words; kept for callers not yet moved. */
export function cardHoldAwaitingCardLine(feePence: number): string {
  const fee = feeSentence(feePence);
  return fee ? `${cardWaitingLine()} ${fee}` : cardWaitingLine();
}

/** @deprecated Use {@link cardProtectedLine}. */
export function cardHoldHeldLine(feePence: number | null): string {
  return cardProtectedLine({ source: null, card: null, feePence });
}

/** `'Card Held'`, released. */
export function cardHoldEndedLine(releasedAtIso: string | null): string {
  if (releasedAtIso) {
    return `The protection ended on ${formatCardHoldDate(releasedAtIso)}.`;
  }
  return 'The protection has ended.';
}

/**
 * Appended to the held line when the 14-day charge window has passed, so staff
 * understand why the Charge button is no longer offered (mirrors the server's
 * `hold_expired` refusal).
 */
export const CARD_HOLD_WINDOW_EXPIRED_LINE =
  'The charge window has ended, so the no-show fee can no longer be charged.';

/**
 * Held line variant for a hold kept by a late cancellation (§9.3 amended):
 * the booking is Cancelled but the fee is still chargeable.
 */
export const CARD_HOLD_LATE_CANCELLED_LINE =
  'The booking was cancelled after the cancellation deadline, so the no-show fee can still be charged.';

/** Release dialog body for a kept hold (release without charging). */
export function cardHoldReleaseDialogBody(guestName: string): string {
  return (
    `This releases ${guestName}'s card without charging the no-show fee. ` +
    "Use it when the cancellation was the business's choice. It cannot be undone."
  );
}

/** Fee charged. Degrades gracefully when amount or date is unknown. */
export function cardHoldChargedLine(
  chargedPence: number | null,
  chargedAtIso: string | null,
): string {
  if (chargedPence != null && chargedPence > 0) {
    const amount = formatCardHoldFeePence(chargedPence);
    return chargedAtIso
      ? `${amount} charged on ${formatCardHoldDate(chargedAtIso)}.`
      : `${amount} charged.`;
  }
  return 'A no-show fee was charged.';
}

/** Refunded after a charge. */
export function cardHoldRefundedLine(chargedPence: number | null): string {
  if (chargedPence != null && chargedPence > 0) {
    return `${formatCardHoldFeePence(chargedPence)} refunded.`;
  }
  return 'The no-show fee was refunded.';
}

/**
 * Plain-words mapping of Stripe charge failure codes. Unknown codes degrade to
 * a generic phrase rather than leaking raw codes to staff.
 */
export function cardHoldChargeFailurePlainReason(code: string): string {
  switch (code) {
    case 'card_declined':
      return 'the card was declined';
    case 'authentication_required':
      return 'the card issuer requires the client to authorise the payment';
    case 'expired_card':
      return 'the card has expired';
    case 'insufficient_funds':
      return 'the card has insufficient funds';
    default:
      return 'the payment did not go through';
  }
}

/** Appended detail line when the last charge attempt failed. */
export function cardHoldChargeFailureLine(code: string): string {
  return `Last charge attempt failed: ${cardHoldChargeFailurePlainReason(code)}.`;
}

/** Charge dialog title. */
export const CARD_HOLD_CHARGE_DIALOG_TITLE = 'Charge no-show fee';

/** Charge dialog body (legacy single-booking path). */
export function cardHoldChargeDialogBody(guestName: string, feePence: number): string {
  return (
    `Charge ${guestName}'s saved card for missing this booking. ` +
    `The maximum you can charge is ${formatCardHoldFeePence(feePence)}.`
  );
}

/** Charge button, live-updating with the entered amount (plan §6.8: "Charge £30"). */
export function cardHoldChargeConfirmLabel(amountPence: number): string {
  return `Charge ${formatCardHoldFeePence(amountPence)}`;
}

/** After a charge (plan §6.8). */
export function cardChargeDoneLine(amountPence: number): string {
  return `${formatCardHoldFeePence(amountPence)} charged. The client has been sent a receipt.`;
}

/* ------------------------------------------------------------------ */
/* Staff UI state resolution (card-hold-ui-state.ts)                   */
/* ------------------------------------------------------------------ */

/** `card_hold` object on `GET /api/venue/bookings/[id]` (plan §10). */
export interface CardHoldSummary {
  fee_pence: number;
  /** Kept for older app builds: true while a card of any kind is on the hold. */
  saved: boolean;
  charged_pence: number | null;
  charged_at: string | null;
  released_at: string | null;
  charge_failure_code: string | null;
  charge_window_ends_at: string | null;
  /** Set when a late cancellation kept the hold chargeable (§9.3 amended). */
  late_cancellation_at?: string | null;
  /* Card on file (plan §10). Every field is absent from older servers. */
  /** `booking_customer` | `awaiting` | `card_on_file` | `till_card`. */
  source?: string | null;
  /** `awaiting` | `not_needed` | `held` | `released` | `charged` | `refunded`. */
  state?: string | null;
  card_state?: ApiCardState | null;
  card?: CardHoldCard | null;
  found_by?: string | null;
  /** "Matched by email and phone online", "Saved by the client" ... */
  found_by_label?: string | null;
  not_you_at?: string | null;
  request_waived_at?: string | null;
  cancel_if_no_card_at?: string | null;
  charge_line_id?: string | null;
}

export interface CardHoldBookingFields {
  status: string;
  deposit_status: string;
  /** The booking date (YYYY-MM-DD), for the expiring-card line (C7). */
  booking_date?: string | null;
  /** The list row's `card_state`, used when the full `card_hold` is not loaded. */
  card_state?: ApiCardState | string | null;
}

export type CardHoldUiKind =
  | 'awaiting_card' // Waiting for card
  | 'not_needed' // Card not needed (staff confirmed without a card)
  | 'request_cancelled' // released before a card was added
  | 'held' // Protected
  | 'ended' // Protected, released
  | 'charged' // Fee charged
  | 'refunded' // Fee refunded
  | 'inactive'; // hold row exists but no display state applies (e.g. 'Failed')

export interface CardHoldUiState {
  kind: CardHoldUiKind;
  /** Pill for the Card section; null for informational-only states. */
  pill: { label: string; variant: CardHoldPillVariant; dot?: boolean } | null;
  /** Detail lines, in render order. */
  lines: string[];
  /** Consented fee snapshot when known; feeds the charge sheet and fee lines. */
  feePence: number | null;
  /**
   * A hold row exists (or the enum value proves one), so the legacy deposit
   * actions (send payment link / waive / record cash) must be hidden.
   */
  hideLegacyDepositActions: true;
  /** Waiting for card or Card not needed: "Send card request" (plan §6.3). */
  showSendCardRequest: boolean;
  /** Waiting for card or Card not needed: "Add card now" (the desk screen). */
  showAddCardNow: boolean;
  /** Waiting for card: "Confirm without a card". */
  showConfirmWithoutCard: boolean;
  /** @deprecated Alias of {@link showSendCardRequest}. */
  showResendLink: boolean;
  /** @deprecated Alias of {@link showConfirmWithoutCard}. */
  showWaive: boolean;
  /** Admin-only client mirror of the charge guards. */
  showChargeAction: boolean;
  /** Admin-only `Refund no-show fee` when the fee was charged. */
  showRefundAction: boolean;
  /** `Release card hold` for a hold kept by a late cancellation (§9.3 amended). */
  showReleaseAction: boolean;
}

/** The hold's state name from the payload, or derived for an older server. */
function holdStateName(
  booking: CardHoldBookingFields,
  cardHold: CardHoldSummary | null | undefined,
): CardHoldUiKind {
  const ds = booking.deposit_status;
  if (cardHold?.state) {
    switch (cardHold.state) {
      case 'awaiting':
        return 'awaiting_card';
      case 'not_needed':
        return 'not_needed';
      case 'held':
        return 'held';
      case 'released':
        return cardHold.saved || cardHold.card ? 'ended' : 'request_cancelled';
      case 'charged':
        return 'charged';
      case 'refunded':
        return 'refunded';
      default:
        break;
    }
  }
  // An older server: decide from deposit_status and the hold row, as before.
  const released = cardHold?.released_at != null;
  if (ds === 'Charged') return 'charged';
  if (ds === 'Refunded') return 'refunded';
  if (ds === 'Card Held') return released ? 'ended' : 'held';
  if (ds === 'Waived') return released ? 'inactive' : 'not_needed';
  if (ds === 'Pending') {
    // A saved-but-not-yet-flipped row (confirm race) reads as held.
    return released ? 'request_cancelled' : cardHold?.saved ? 'held' : 'awaiting_card';
  }
  if (cardHold && !cardHold.saved && !released && cardHold.request_waived_at) return 'not_needed';
  return 'inactive';
}

/** From a list row's `card_state` when the full `card_hold` is not loaded. */
function kindFromCardState(state: string | null | undefined): CardHoldUiKind | null {
  switch (state) {
    case 'protected':
      return 'held';
    case 'waiting':
      return 'awaiting_card';
    case 'not_needed':
      return 'not_needed';
    case 'charged':
      return 'charged';
    default:
      return null;
  }
}

/**
 * Resolve the Card section (plan §6.3) for a booking: the pill, the lines and
 * which actions apply.
 *
 * Returns null when the booking has no card hold at all, in which case the
 * legacy deposit UI applies unchanged. When `cardHold` is missing from the
 * payload (list rows, the summary prefetch) a conservative state comes from
 * the row's `card_state`, or from the hold-only enum values (`'Card Held'` /
 * `'Charged'`): the right pill, fee-less lines, and no charge action (the gate
 * needs the hold row's window fields).
 */
export function resolveCardHoldUiState(
  booking: CardHoldBookingFields,
  cardHold: CardHoldSummary | null | undefined,
  opts: { isAdmin: boolean; now?: Date },
): CardHoldUiState | null {
  const ds = booking.deposit_status;
  const rowKind = cardHold ? null : kindFromCardState(booking.card_state ?? null);
  const holdOnlyEnum = ds === 'Card Held' || ds === 'Charged';
  if (!cardHold && !rowKind && !holdOnlyEnum) return null;

  const released = cardHold?.released_at != null;
  const feePence = cardHold ? cardHold.fee_pence : null;

  const now = opts.now ?? new Date();
  const windowEndsAt = cardHold?.charge_window_ends_at
    ? Date.parse(cardHold.charge_window_ends_at)
    : Number.NaN;
  const windowExpired = Number.isFinite(windowEndsAt) && now.getTime() > windowEndsAt;

  // Kept by a late cancellation (§9.3 amended): booking Cancelled, hold open,
  // late_cancellation_at stamped. The fee stays chargeable and staff may
  // release without charging.
  const keptByLateCancellation =
    booking.status === 'Cancelled' &&
    ds === 'Card Held' &&
    !released &&
    cardHold?.late_cancellation_at != null;

  const kind: CardHoldUiKind = cardHold
    ? holdStateName(booking, cardHold)
    : rowKind ?? (ds === 'Charged' ? 'charged' : 'held');

  let pill: CardHoldUiState['pill'] = null;
  const lines: string[] = [];
  switch (kind) {
    case 'awaiting_card': {
      pill = { label: CARD_HOLD_PILL_WAITING, variant: 'warning', dot: true };
      if (cardHold?.not_you_at) lines.push(CARD_NOT_YOU_LINE);
      lines.push(cardWaitingLine());
      if (cardHold?.cancel_if_no_card_at) lines.push(cardCancelIfNoCardLine(cardHold.cancel_if_no_card_at));
      const fee = feeSentence(feePence);
      if (fee) lines.push(fee);
      break;
    }
    case 'not_needed': {
      pill = { label: CARD_HOLD_PILL_NOT_NEEDED, variant: 'neutral' };
      if (cardHold?.not_you_at) lines.push(CARD_NOT_YOU_LINE);
      lines.push(CARD_NOT_NEEDED_LINE);
      break;
    }
    case 'request_cancelled':
      lines.push(CARD_HOLD_REQUEST_CANCELLED_LINE);
      break;
    case 'held':
      pill = { label: CARD_HOLD_PILL_PROTECTED, variant: 'info', dot: true };
      lines.push(
        cardProtectedLine({ source: cardHold?.source ?? null, card: cardHold?.card ?? null, feePence }),
      );
      if (cardHold?.found_by_label && cardHold.source !== 'booking_customer') {
        lines.push(`${cardHold.found_by_label}.`);
      }
      if (
        cardHold?.card &&
        cardExpiresBefore(cardHold.card.exp_month, cardHold.card.exp_year, booking.booking_date)
      ) {
        lines.push(CARD_EXPIRES_BEFORE_LINE);
      }
      if (keptByLateCancellation) lines.push(CARD_HOLD_LATE_CANCELLED_LINE);
      if (cardHold?.charge_failure_code) {
        lines.push(cardHoldChargeFailureLine(cardHold.charge_failure_code));
      }
      if (
        (booking.status === 'No-Show' || keptByLateCancellation) &&
        cardHold?.saved &&
        windowExpired
      ) {
        lines.push(CARD_HOLD_WINDOW_EXPIRED_LINE);
      }
      break;
    case 'ended':
      pill = { label: CARD_HOLD_PILL_ENDED, variant: 'neutral' };
      lines.push(cardHoldEndedLine(cardHold?.released_at ?? null));
      break;
    case 'charged':
      pill = { label: CARD_HOLD_PILL_CHARGED, variant: 'brand', dot: true };
      lines.push(cardHoldChargedLine(cardHold?.charged_pence ?? null, cardHold?.charged_at ?? null));
      break;
    case 'refunded':
      pill = { label: CARD_HOLD_PILL_REFUNDED, variant: 'neutral' };
      lines.push(cardHoldRefundedLine(cardHold?.charged_pence ?? null));
      break;
    case 'inactive':
      break;
  }

  // Client mirror of the server's charge guards (the server re-checks all of
  // them): No-Show OR a late-cancellation keep, 'Card Held', hold open, a
  // card on the hold, within the charge window.
  const chargeEligible =
    (booking.status === 'No-Show' || keptByLateCancellation) &&
    ds === 'Card Held' &&
    cardHold != null &&
    cardHold.saved &&
    cardHold.released_at == null &&
    !windowExpired &&
    Number.isFinite(windowEndsAt);

  // A booking that is over (or cancelled) cannot be given a card any more.
  const open = booking.status === 'Pending' || booking.status === 'Booked' || booking.status === 'Confirmed';
  const sendable = (kind === 'awaiting_card' || kind === 'not_needed') && open;

  return {
    kind,
    pill,
    lines,
    feePence,
    hideLegacyDepositActions: true,
    showSendCardRequest: sendable,
    showAddCardNow: sendable,
    showConfirmWithoutCard: kind === 'awaiting_card' && open,
    showResendLink: sendable,
    showWaive: kind === 'awaiting_card' && open,
    showChargeAction: opts.isAdmin && chargeEligible,
    showRefundAction: opts.isAdmin && kind === 'charged' && cardHold != null,
    showReleaseAction: keptByLateCancellation && cardHold?.saved === true,
  };
}

/**
 * Roster affordance candidate (§9.2 class roster). The attendees payload
 * carries only `status` + `deposit_status` (no hold row fields), so the roster
 * cannot mirror the full charge gate; it flags chargeable-looking rows so the
 * row press (which opens the full booking detail) is where the real gate is
 * re-derived. Enum-only check: canonical No-Show plus the hold-only 'Card Held'.
 */
export function isRosterChargeLinkCandidate(attendee: {
  status: string;
  deposit_status: string | null;
}): boolean {
  return attendee.status === 'No-Show' && attendee.deposit_status === 'Card Held';
}

/* ------------------------------------------------------------------ */
/* Staff booking-form toggle helpers (staff-card-hold.ts)              */
/* ------------------------------------------------------------------ */

/** Switch label (§7.6, exact string). */
export const STAFF_CARD_HOLD_TOGGLE_LABEL = 'Card hold';

/**
 * How long the guest has to add a card before the held booking is cancelled
 * (web `card-hold-terms.ts` `CARD_HOLD_LINK_TIMEOUT_HOURS`).
 */
export const CARD_HOLD_LINK_TIMEOUT_HOURS = 24;

/** Sublabel while the switch is ON: what the guest gets and when the card is charged (web #187). */
export const STAFF_CARD_HOLD_TOGGLE_SUBLABEL_ON = `On: the client gets a link to add their card, charged only if they do not show. The booking is cancelled if no card is added within ${CARD_HOLD_LINK_TIMEOUT_HOURS} hours.`;
/** Sublabel while the switch is OFF (the default since web #187): what leaving it off means. */
export const STAFF_CARD_HOLD_TOGGLE_SUBLABEL_OFF =
  'Off: no card is taken, so a no-show cannot be charged.';
/**
 * Sublabel while the switch is ON for a walk-in (web QA 2026-11-08 BKG-A-F9): a walk-in is booked
 * straight away with the card request open, and is never cancelled for a missing card.
 */
export const STAFF_CARD_HOLD_TOGGLE_SUBLABEL_ON_WALK_IN =
  'On: the client gets a link to add their card, charged only if they do not show. A walk-in is booked straight away and is not cancelled if no card is added.';
/** The sublabel for the switch's current state, so staff can see what each position does. */
export function staffCardHoldToggleSublabel(checked: boolean, walkIn = false): string {
  if (!checked) return STAFF_CARD_HOLD_TOGGLE_SUBLABEL_OFF;
  return walkIn ? STAFF_CARD_HOLD_TOGGLE_SUBLABEL_ON_WALK_IN : STAFF_CARD_HOLD_TOGGLE_SUBLABEL_ON;
}

/** Success toast when the booking was created with a hold requested (§7.6, ASCII hyphen). */
export const STAFF_CARD_HOLD_CREATED_TOAST = 'Booking created - card request link sent';

/** Confirmation-screen line for flows that show an inline panel instead of a toast. */
export const STAFF_CARD_HOLD_LINK_SENT_LINE = 'A card request link was sent to the client.';

/** "No-show fee up to £X" — on the confirmation line (no longer under the toggle, web #187). */
export function staffCardHoldFeeLine(feePence: number): string {
  return `No-show fee up to ${formatCardHoldFeePence(feePence)}`;
}

/** The selected entity takes a card hold; `feePence` is the fee for the whole booking. */
export interface StaffCardHoldContext {
  feePence: number;
}

/**
 * Appointments, classes, events, resources (the app has no staff table form).
 * These entity payloads carry the configured `payment_requirement`; a
 * `card_hold` entity takes a hold whenever its fee is positive (spec 6.3: the
 * public offering payloads the app lists from resolve zero-fee holds to
 * `none` server-side, and this check mirrors that). Card hold is a standard
 * payment option for every venue since the `card_hold_deposits` flag was
 * retired on 2026-09-05, so there is no venue-level gate here.
 *
 * `feePerUnitPence` is the per-unit no-show fee (per person for classes and
 * events, per booking for appointments and resources); `units` multiplies it
 * (spots / tickets; defaults to 1).
 */
export function resolveStaffEntityCardHold(args: {
  paymentRequirement: string | null | undefined;
  feePerUnitPence: number | null | undefined;
  units?: number;
}): StaffCardHoldContext | null {
  if (args.paymentRequirement !== 'card_hold') return null;
  const perUnit = args.feePerUnitPence;
  if (typeof perUnit !== 'number' || !Number.isFinite(perUnit) || perUnit <= 0) return null;
  const units =
    typeof args.units === 'number' && Number.isFinite(args.units) && args.units >= 1
      ? Math.floor(args.units)
      : 1;
  return { feePence: perUnit * units };
}

/* ------------------------------------------------------------------ */
/* Staff booking form card line (card-on-file-plan §6.2)               */
/* ------------------------------------------------------------------ */

/** The switch shown when no card is found (C2: on by default). */
export const STAFF_SEND_CARD_REQUEST_LABEL = 'Send a card request';
/** The optional tick under it (D26: off by default). */
export const STAFF_CANCEL_IF_NO_CARD_LABEL = 'Cancel if no card is added within 24 hours';
/** The small link under a found card. */
export const STAFF_DONT_USE_CARD_LABEL = "Don't use the card for this booking";
/** Turns a "Don't use the card" back. */
export const STAFF_USE_CARD_LABEL = 'Use the card on file';

/** The line under "Send a card request" for the switch and tick positions (plan §6.2). */
export function staffSendCardRequestLine(on: boolean, cancelIfNoCard: boolean, walkIn = false): string {
  if (!on) return 'No card will be asked for. The booking shows Card not needed.';
  if (cancelIfNoCard && !walkIn) {
    return 'The booking waits for the card, and is cancelled if none is added within 24 hours.';
  }
  return "The booking is confirmed now. If the client doesn't add a card, it stays booked and shows Waiting for card.";
}

/**
 * The tick is offered only for a phone booking whose client has an email or a
 * mobile number (a request must be able to reach them), never for a walk-in
 * (plan §4.9; web `cancelIfNoCardAllowed`).
 */
export function staffCancelIfNoCardAllowed(input: {
  walkIn: boolean;
  email?: string | null;
  phone?: string | null;
}): boolean {
  if (input.walkIn) return false;
  return Boolean(input.email?.trim()) || Boolean(input.phone?.trim());
}

/** "Protected by card on file (Visa ending 4242). No-show fee up to £10." */
export function staffCardFoundLine(
  brand: string | null | undefined,
  last4: string | null | undefined,
  feePence: number | null | undefined,
): string {
  const fee = feeSentence(feePence);
  const head = brand || last4 ? `Protected by card on file (${cardLabel(brand, last4)}).` : 'Protected by card on file.';
  return fee ? `${head} ${fee}` : head;
}

/** A group: "Protected by {lead}'s card on file. It covers everyone in this booking." */
export function staffGroupCardFoundLine(leadName: string | null | undefined): string {
  const lead = leadName?.trim();
  return lead
    ? `Protected by ${lead}'s card on file. It covers everyone in this booking.`
    : "Protected by the lead client's card on file. It covers everyone in this booking.";
}

/** "Card not possible: {business} can't take card payments yet." */
export function staffCardNotPossibleLine(businessName: string | null | undefined): string {
  const name = businessName?.trim() || 'this business';
  return `Card not possible: ${name} can't take card payments yet.`;
}

/** `card_on_file` on a staff create response (plan §10). Absent from older servers. */
export interface StaffCreateCardOnFile {
  covered: boolean;
  state: 'protected' | 'waiting' | 'not_needed' | 'not_possible';
  brand: string | null;
  last4: string | null;
  found_by: string | null;
  found_by_label: string | null;
  kind: 'card_on_file' | 'till_card' | null;
  cancel_if_no_card_at: string | null;
  /**
   * No request went now: one already went to this client today (one card message a day). Their link
   * lists this booking too. Absent from older servers.
   */
  request_already_sent_today?: boolean;
}

/** Narrow the create response's `card_on_file` (null when absent or malformed). */
export function parseStaffCreateCardOnFile(value: unknown): StaffCreateCardOnFile | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const state = v.state;
  if (state !== 'protected' && state !== 'waiting' && state !== 'not_needed' && state !== 'not_possible') {
    return null;
  }
  const str = (x: unknown) => (typeof x === 'string' ? x : null);
  return {
    covered: v.covered === true,
    state,
    brand: str(v.brand),
    last4: str(v.last4),
    found_by: str(v.found_by),
    found_by_label: str(v.found_by_label),
    kind: v.kind === 'card_on_file' || v.kind === 'till_card' ? v.kind : null,
    cancel_if_no_card_at: str(v.cancel_if_no_card_at),
    request_already_sent_today: v.request_already_sent_today === true,
  };
}

/**
 * The confirmation screen's card lines (plan §6.2): the heading word and what
 * happened. `sentTo` is the client's email (or phone) when a request went.
 */
export function staffCardConfirmationLines(input: {
  cardOnFile: StaffCreateCardOnFile;
  feePence?: number | null;
  sentTo?: string | null;
  businessName?: string | null;
}): { heading: 'Booking confirmed' | 'Waiting for card'; lines: string[] } {
  const { cardOnFile } = input;
  switch (cardOnFile.state) {
    case 'protected':
      return {
        heading: 'Booking confirmed',
        lines: [staffCardFoundLine(cardOnFile.brand, cardOnFile.last4, input.feePence ?? null)],
      };
    case 'not_needed':
      return { heading: 'Booking confirmed', lines: ['No card was asked for. The booking shows Card not needed.'] };
    case 'not_possible':
      return { heading: 'Booking confirmed', lines: [staffCardNotPossibleLine(input.businessName)] };
    case 'waiting': {
      const lines: string[] = [];
      if (cardOnFile.request_already_sent_today) {
        // Staff were told a request was sent when none was (2026-11-19).
        lines.push(
          input.sentTo
            ? `${input.sentTo} already had a card request today, so no new one was sent. The link in it covers this booking too.`
            : 'The client already had a card request today, so no new one was sent. The link in it covers this booking too.',
        );
      } else {
        lines.push(input.sentTo ? `A card request was sent to ${input.sentTo}.` : 'A card request was sent to the client.');
      }
      if (cardOnFile.cancel_if_no_card_at) {
        lines.push(cardCancelIfNoCardLine(cardOnFile.cancel_if_no_card_at));
        return { heading: 'Waiting for card', lines };
      }
      lines.push('The booking stays booked and shows Waiting for card until the client adds one.');
      return { heading: 'Booking confirmed', lines };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Bulk words (plan §4.16, §6.4)                                       */
/* ------------------------------------------------------------------ */

/** "86 bookings" / "1 booking". */
export function bookingsCountLabel(n: number): string {
  return `${n} booking${n === 1 ? '' : 's'}`;
}

/** The question before a bulk Confirm without a card (plan §6.4). */
export function confirmWithoutCardQuestion(n: number): { title: string; body: string; confirmLabel: string } {
  return {
    title: `Confirm ${bookingsCountLabel(n)} without a card?`,
    body: 'They stay booked, reminders stop, and none will be cancelled for a missing card. Clients can still add a card before their appointment.',
    confirmLabel: `Confirm ${bookingsCountLabel(n)}`,
  };
}

/** The question before bulk Send card requests. */
export function sendCardRequestsQuestion(n: number): { title: string; body: string; confirmLabel: string } {
  return {
    title: `Send card requests for ${bookingsCountLabel(n)}?`,
    body: 'Each client gets one request covering all their bookings waiting for a card. Nobody gets more than one a day.',
    confirmLabel: 'Send card requests',
  };
}

/** Counts of a bulk Send card requests, or of its preview (clients, not bookings). */
export interface CardRequestCounts {
  clients: number;
  emails: number;
  texts: number;
  skippedNoContact: number;
  skippedAlreadyToday: number;
  failedClients: number;
}

function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function cardRequestChannels(emails: number, texts: number): string {
  const parts: string[] = [];
  if (emails > 0) parts.push(countOf(emails, 'email', 'emails'));
  if (texts > 0) parts.push(countOf(texts, 'text', 'texts'));
  return parts.join(' and ');
}

function cardRequestSkippedSentences(c: CardRequestCounts, preview: boolean): string[] {
  const reasons = (
    [
      ['already_today', c.skippedAlreadyToday],
      ['no_contact', c.skippedNoContact],
    ] as const
  ).filter(([, n]) => n > 0);
  if (c.clients === 0 && c.failedClients === 0 && reasons.length === 1) {
    const [reason, n] = reasons[0];
    if (reason === 'already_today') {
      if (n === 1) return ['The client was already sent one today.'];
      if (n === 2) return ['Both clients were already sent one today.'];
      return [`All ${n} clients were already sent one today.`];
    }
    if (n === 1) return ['The client has no email or phone.'];
    if (n === 2) return ['Neither client has an email or phone.'];
    return [`None of the ${n} clients has an email or phone.`];
  }
  return reasons.map(([reason, n]) => {
    const verb = preview ? 'will be' : n === 1 ? 'was' : 'were';
    const why = reason === 'already_today' ? 'already sent one today' : 'no email or phone';
    return `${countOf(n, 'client', 'clients')} ${verb} skipped: ${why}.`;
  });
}

/** After a bulk send, as the web words it: "Card requests sent to 3 clients: 3 emails and 2 texts." */
export function cardRequestsResultMessage(c: CardRequestCounts): string {
  const channels = cardRequestChannels(c.emails, c.texts);
  const head =
    c.clients > 0
      ? `${c.clients === 1 ? 'Card request' : 'Card requests'} sent to ${countOf(c.clients, 'client', 'clients')}${channels ? `: ${channels}` : ''}.`
      : 'No requests sent.';
  const parts = [head, ...cardRequestSkippedSentences(c, false)];
  if (c.failedClients > 0) parts.push(`${countOf(c.failedClients, 'request', 'requests')} could not be sent. Please try again.`);
  return parts.join(' ');
}

/** Before a bulk send, in the question: "This sends to 12 clients: 12 emails and 9 texts." */
export function cardRequestsPreviewMessage(c: CardRequestCounts): string {
  const channels = cardRequestChannels(c.emails, c.texts);
  const head =
    c.clients > 0
      ? `This sends to ${countOf(c.clients, 'client', 'clients')}${channels ? `: ${channels}` : ''}.`
      : 'No requests will be sent.';
  const parts = [head, ...cardRequestSkippedSentences(c, true)];
  if (c.failedClients > 0) {
    parts.push(`${countOf(c.failedClients, 'client', 'clients')} can't be sent one: card requests are switched off in your message settings.`);
  }
  return parts.join(' ');
}

/** How long Undo stays available after a bulk Confirm without a card (plan §4.16). */
export const CONFIRM_WITHOUT_CARD_UNDO_MS = 5 * 60 * 1000;

/** The dashboard home line (plan §6.5). */
export function waitingForCardHomeLine(n: number): string {
  return `${n} upcoming ${n === 1 ? 'booking is' : 'bookings are'} waiting for a card`;
}
