/**
 * Card-hold deposits: staff UI state, copy, and helpers.
 *
 * Consolidated port of the web modules (kept in web order so parity diffs stay
 * mechanical):
 *  - _reference/Resneo/src/lib/booking/card-hold-terms.ts (fee formatting)
 *  - _reference/Resneo/src/components/booking/card-hold-copy.ts (staff strings)
 *  - _reference/Resneo/src/components/booking/card-hold-ui-state.ts (state machine)
 *  - _reference/Resneo/src/components/booking/staff-card-hold.ts (create-form toggle)
 *
 * Docs: CARD_HOLD_DEPOSITS_DESIGN_AND_IMPLEMENTATION §9.1 state table, §9.2
 * charge gate, §7.6/D6 staff toggle. No em-dashes anywhere in this copy.
 */

/* ------------------------------------------------------------------ */
/* Fee formatting (card-hold-terms.ts)                                 */
/* ------------------------------------------------------------------ */

/** £X.XX from pence, e.g. 2500 -> "£25.00". */
export function formatCardHoldFeePence(feePence: number): string {
  return `£${(Number(feePence) / 100).toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* Staff copy (card-hold-copy.ts, staff half)                          */
/* ------------------------------------------------------------------ */

/** Pill labels from the §9.1 state table (exact strings). */
export const CARD_HOLD_PILL_REQUEST_SENT = 'Card request sent';
export const CARD_HOLD_PILL_HELD = 'Card held';
export const CARD_HOLD_PILL_ENDED = 'Card hold ended';
export const CARD_HOLD_PILL_CHARGED = 'No-show fee charged';
export const CARD_HOLD_PILL_REFUNDED = 'No-show fee refunded';

/** Staff action labels (§9.1/§9.2). */
export const CARD_HOLD_RESEND_LINK_LABEL = 'Resend link';
export const CARD_HOLD_WAIVE_LABEL = 'Waive';
export const CARD_HOLD_CHARGE_ACTION_LABEL = 'Charge no-show fee';
export const CARD_HOLD_REFUND_ACTION_LABEL = 'Refund no-show fee';
export const CARD_HOLD_RELEASE_ACTION_LABEL = 'Release card hold';

/** Short date used in staff hold detail lines, e.g. "3 Jul 2026". */
export function formatCardHoldDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `'Pending'` + open unsaved hold detail line (§9.1). */
export function cardHoldAwaitingCardLine(feePence: number): string {
  return `Waiting for the guest to add card details. No-show fee up to ${formatCardHoldFeePence(feePence)}.`;
}

/** `'Pending'` + released hold (booking cancelled before the card was saved) (§9.1). */
export const CARD_HOLD_REQUEST_CANCELLED_LINE = 'The card request was cancelled with the booking.';

/** `'Card Held'`, not released (§9.1). Fee-less fallback for payloads without the hold row. */
export function cardHoldHeldLine(feePence: number | null): string {
  if (feePence != null && feePence > 0) {
    return `No-show fee up to ${formatCardHoldFeePence(feePence)}. No payment taken.`;
  }
  return 'Card securely on file. No payment taken.';
}

/** `'Card Held'`, released (§9.1). */
export function cardHoldEndedLine(releasedAtIso: string | null): string {
  if (releasedAtIso) {
    return `The card hold was released on ${formatCardHoldDate(releasedAtIso)}.`;
  }
  return 'The card hold has ended.';
}

/** `'Waived'` deposit_status: the card request was waived before any card was saved (§9.1). */
export const CARD_HOLD_WAIVED_LINE = 'The card request was waived. No card is on file.';

/**
 * Appended to the held line when the 14-day charge window has passed, so staff
 * understand why the Charge button is no longer offered (mirrors the server's
 * `hold_expired` 409).
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
    "Use it when the cancellation was the venue's choice. It cannot be undone."
  );
}

/** `'Charged'` (§9.1). Degrades gracefully when amount or date is unknown. */
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

/** `'Refunded'` after a charge (§9.1). */
export function cardHoldRefundedLine(chargedPence: number | null): string {
  if (chargedPence != null && chargedPence > 0) {
    return `${formatCardHoldFeePence(chargedPence)} refunded.`;
  }
  return 'The no-show fee was refunded.';
}

/**
 * Plain-words mapping of Stripe charge failure codes (§8.5/§9.1). Unknown codes
 * degrade to a generic phrase rather than leaking raw codes to staff.
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

/** Appended detail line when the last charge attempt failed (§9.1). */
export function cardHoldChargeFailureLine(code: string): string {
  return `Last charge attempt failed: ${cardHoldChargeFailurePlainReason(code)}.`;
}

/** Charge dialog title (§9.2, exact string). */
export const CARD_HOLD_CHARGE_DIALOG_TITLE = 'Charge no-show fee';

/** Charge dialog body (§9.2, exact string). */
export function cardHoldChargeDialogBody(guestName: string, feePence: number): string {
  return (
    `Charge ${guestName}'s saved card for missing this booking. ` +
    `The maximum you can charge is ${formatCardHoldFeePence(feePence)}.`
  );
}

/** Charge dialog confirm button, live-updating with the entered amount (§9.2). */
export function cardHoldChargeConfirmLabel(amountPence: number): string {
  return `Charge ${formatCardHoldFeePence(amountPence)}`;
}

/* ------------------------------------------------------------------ */
/* Staff UI state resolution (card-hold-ui-state.ts)                   */
/* ------------------------------------------------------------------ */

/** `card_hold` object on `GET /api/venue/bookings/[id]` (§9.1). */
export interface CardHoldSummary {
  fee_pence: number;
  saved: boolean;
  charged_pence: number | null;
  charged_at: string | null;
  released_at: string | null;
  charge_failure_code: string | null;
  charge_window_ends_at: string | null;
  /** Set when a late cancellation kept the hold chargeable (§9.3 amended). */
  late_cancellation_at?: string | null;
}

export interface CardHoldBookingFields {
  status: string;
  deposit_status: string;
}

export type CardHoldUiKind =
  | 'awaiting_card' // 'Pending' + open unsaved hold (staff flow, awaiting card)
  | 'request_cancelled' // 'Pending' + released hold (cancelled before the card was saved)
  | 'held' // 'Card Held', not released
  | 'ended' // 'Card Held', released
  | 'charged' // 'Charged'
  | 'refunded' // 'Refunded' (was 'Charged')
  | 'inactive'; // hold row exists but no display state applies (e.g. 'Waived', 'Failed')

export type CardHoldPillVariant = 'warning' | 'info' | 'neutral' | 'brand';

export interface CardHoldUiState {
  kind: CardHoldUiKind;
  /** Pill for the deposit block; null for informational-only states. */
  pill: { label: string; variant: CardHoldPillVariant; dot?: boolean } | null;
  /** Detail lines, in render order (charge-failure line already appended). */
  lines: string[];
  /** Consented fee snapshot when known; feeds the charge dialog and fee lines. */
  feePence: number | null;
  /**
   * A hold row exists (or the enum value proves one), so the three legacy
   * deposit actions (send payment link / waive / record cash) must be hidden.
   * Always true when this object is non-null; explicit for readability.
   */
  hideLegacyDepositActions: true;
  /** Awaiting-card only: card-aware `Resend link` (posts `send_payment_link`, §9.2b). */
  showResendLink: boolean;
  /** Awaiting-card only: `Waive` (server releases the unsaved hold, §9.2c). */
  showWaive: boolean;
  /** Admin-only client mirror of the §9.2a charge guards. */
  showChargeAction: boolean;
  /** Admin-only `Refund no-show fee` when the fee was charged (§9.2e). */
  showRefundAction: boolean;
  /**
   * `Release card hold` for a hold kept by a late cancellation (§9.3 amended):
   * releases without charging, e.g. when the venue asked for the cancellation.
   * Any staff, matching the waive action.
   */
  showReleaseAction: boolean;
}

/**
 * Resolve the §9.1 display + action state for a booking.
 *
 * Returns null when the booking has no card hold at all, in which case the
 * legacy deposit UI applies unchanged. When `cardHold` is missing from the
 * payload (list rows, optimistic snapshots) but `deposit_status` is one of the
 * hold-only enum values (`'Card Held'` / `'Charged'`), a conservative
 * enum-only state is returned: correct pill, fee-less lines, and no charge
 * action (the gate needs the hold row's `saved` / window fields).
 */
export function resolveCardHoldUiState(
  booking: CardHoldBookingFields,
  cardHold: CardHoldSummary | null | undefined,
  opts: { isAdmin: boolean; now?: Date },
): CardHoldUiState | null {
  const ds = booking.deposit_status;
  const holdOnlyEnum = ds === 'Card Held' || ds === 'Charged';
  if (!cardHold && !holdOnlyEnum) return null;

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

  let kind: CardHoldUiKind;
  if (ds === 'Charged') {
    kind = 'charged';
  } else if (ds === 'Refunded') {
    kind = 'refunded';
  } else if (ds === 'Card Held') {
    kind = released ? 'ended' : 'held';
  } else if (ds === 'Pending') {
    // A saved-but-not-yet-flipped row (confirm race) reads as held: the card
    // is on file and the resend/waive affordances no longer apply.
    kind = released ? 'request_cancelled' : cardHold?.saved ? 'held' : 'awaiting_card';
  } else {
    kind = 'inactive';
  }

  let pill: CardHoldUiState['pill'] = null;
  const lines: string[] = [];
  switch (kind) {
    case 'awaiting_card':
      pill = { label: CARD_HOLD_PILL_REQUEST_SENT, variant: 'warning', dot: true };
      lines.push(cardHoldAwaitingCardLine(feePence ?? 0));
      break;
    case 'request_cancelled':
      lines.push(CARD_HOLD_REQUEST_CANCELLED_LINE);
      break;
    case 'held':
      pill = { label: CARD_HOLD_PILL_HELD, variant: 'info', dot: true };
      lines.push(cardHoldHeldLine(feePence));
      // A hold kept by a late cancellation: say why it is still chargeable
      // on a Cancelled booking (§9.3 amended).
      if (keptByLateCancellation) {
        lines.push(CARD_HOLD_LATE_CANCELLED_LINE);
      }
      if (cardHold?.charge_failure_code) {
        lines.push(cardHoldChargeFailureLine(cardHold.charge_failure_code));
      }
      // Explain the missing Charge button once the window has passed for a
      // saved hold that would otherwise still look chargeable.
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
      pill = { label: CARD_HOLD_PILL_CHARGED, variant: 'warning', dot: true };
      lines.push(cardHoldChargedLine(cardHold?.charged_pence ?? null, cardHold?.charged_at ?? null));
      break;
    case 'refunded':
      pill = { label: CARD_HOLD_PILL_REFUNDED, variant: 'brand' };
      lines.push(cardHoldRefundedLine(cardHold?.charged_pence ?? null));
      break;
    case 'inactive':
      // A waived request is the only inactive state with something to say.
      if (ds === 'Waived') lines.push(CARD_HOLD_WAIVED_LINE);
      break;
  }

  // Client mirror of the §9.2a guards 2-6 (the server re-checks all of them):
  // No-Show status OR a late-cancellation keep, 'Card Held', hold open, saved
  // card, within the charge window.
  const chargeEligible =
    (booking.status === 'No-Show' || keptByLateCancellation) &&
    ds === 'Card Held' &&
    cardHold != null &&
    cardHold.saved &&
    cardHold.released_at == null &&
    !windowExpired &&
    Number.isFinite(windowEndsAt);

  return {
    kind,
    pill,
    lines,
    feePence,
    hideLegacyDepositActions: true,
    showResendLink: kind === 'awaiting_card',
    showWaive: kind === 'awaiting_card',
    showChargeAction: opts.isAdmin && chargeEligible,
    showRefundAction: opts.isAdmin && kind === 'charged',
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

/** Switch sublabel (§7.6, exact string). */
export const STAFF_CARD_HOLD_TOGGLE_SUBLABEL =
  'Send a link to the guest to add their card details';

/** Success toast when the booking was created with a hold requested (§7.6, ASCII hyphen). */
export const STAFF_CARD_HOLD_CREATED_TOAST = 'Booking created - card request link sent';

/** Confirmation-screen line for flows that show an inline panel instead of a toast. */
export const STAFF_CARD_HOLD_LINK_SENT_LINE = 'A card request link was sent to the guest.';

/** Small fee line under the toggle while it is on. */
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
