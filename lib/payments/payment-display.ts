/**
 * In-person payments (Tap to Pay): pure display + gating helpers.
 *
 * Single source of truth for the §3.4 button gate and the neutral
 * payment-state labels, so the frictionless rules cannot drift between
 * surfaces (docs: TAP_TO_PAY_DESIGN_AND_IMPLEMENTATION §3, §7.8).
 *
 * Everything here is a pure function: no React, no SDK, unit-testable.
 * `payment_state ∈ {unpaid, deposit_paid, partially_paid}` is rendered as
 * neutral information, never as a blocking error or required-action callout.
 */

import type {
  BookingDetail,
  BookingPaymentRow,
  BookingPaymentState,
  VisitPayment,
} from '@/types/booking-detail';

/** One line of the "Payments & confirmation" price summary. */
export interface PriceSummaryRow {
  key: string;
  label: string;
  /** Amount in pence, or null when `note` explains why there isn't one. */
  pence: number | null;
  /** Shown in place of an amount (e.g. an unpriced service). */
  note?: string;
  /** Totals and the outstanding balance read louder than the item lines. */
  emphasis?: boolean;
  /** Add-ons sit under their service. */
  indent?: boolean;
}

/**
 * The money breakdown for a booking: each priced item, the booking total, the
 * visit total when this is one line of a multi-service visit, what has been paid
 * (deposit included), and what is outstanding.
 *
 * Returns `[]` when there is nothing to say — an unpriced booking with no
 * deposit and no payments renders no price block at all.
 *
 * Two deliberate choices:
 *
 * 1. **An unpriced service still produces a row**, labelled rather than hidden.
 *    `booking_total_price_pence` is NULL for appointments created by the widget,
 *    the app, or staff booking (backend §5.7), so the total falls back to
 *    variant + add-ons. When the variant carries no price the balance is `null`
 *    and the Take payment sheet asks staff to type an amount. Silently showing
 *    nothing makes that look like a bug; naming it points at the fix.
 * 2. **The deposit is not subtracted on screen.** `amount_paid_pence` already
 *    includes a paid deposit (backend `computeLiveAmountPaidPence`), so showing
 *    both as deductions would double-count. The deposit is informational, and
 *    "Paid so far" only appears when it differs from the deposit alone.
 */
export function buildPriceSummary(booking: BookingDetail): PriceSummaryRow[] {
  const rows: PriceSummaryRow[] = [];

  const variantPence = booking.service_variant_price_pence ?? null;
  const serviceLabel = booking.service_variant_name?.trim() || null;
  const addons = booking.addons ?? [];

  const visit = booking.visit_payment ?? null;
  /**
   * A multi-service visit lists every service with its own price, from
   * `visit_payment.lines`. Those per-line totals already include each line's
   * add-ons, so this booking's individual add-on rows and its own "Booking
   * total" are suppressed — showing both would read as double-counting.
   */
  const visitLines = visit && visit.booking_count > 1 ? (visit.lines ?? []) : [];
  const useVisitLines = visitLines.length > 1;

  if (useVisitLines) {
    visitLines.forEach((line, idx) => {
      const label =
        line.name?.trim() ||
        // The backend leaves the name null for a non-variant line; for the row
        // on screen we already know it.
        (line.booking_id === booking.id ? serviceLabel : null) ||
        'Service';
      rows.push({
        key: `line-${line.booking_id}-${idx}`,
        label,
        pence: line.total_pence,
        ...(line.total_pence == null ? { note: 'Price not set' } : {}),
      });
    });
  } else {
    if (serviceLabel) {
      rows.push({
        key: 'service',
        label: serviceLabel,
        pence: variantPence,
        ...(variantPence == null ? { note: 'Price not set' } : {}),
      });
    }

    addons.forEach((addon, idx) => {
      rows.push({
        // `id` is optional on the addon snapshot, so fall back to the index —
        // `addon-undefined` would collide across rows.
        key: `addon-${addon.id ?? addon.addon_id ?? idx}`,
        label: addon.addon_name_snapshot,
        pence: addon.price_pence_at_booking,
        indent: true,
      });
    });
  }

  // Mirrors the backend resolver: the stored column wins, else variant + add-ons,
  // else the price is genuinely unknown.
  const addonsTotal = booking.addons_total_price_pence ?? 0;
  const computed = (variantPence ?? 0) + addonsTotal;
  const totalPence =
    booking.booking_total_price_pence != null && booking.booking_total_price_pence > 0
      ? booking.booking_total_price_pence
      : computed > 0
        ? computed
        : null;

  // Worth a total row unless it would just repeat the only item line. Note this
  // still shows when add-ons contribute to the total but their individual rows
  // are absent (the summary payload omits `addons`), because "service £40 /
  // total £50" tells staff there is more to the booking than the one line.
  const onlyItemPence = rows.length === 1 ? rows[0].pence : null;
  if (
    !useVisitLines &&
    totalPence != null &&
    !(rows.length === 1 && onlyItemPence === totalPence)
  ) {
    rows.push({ key: 'total', label: 'Booking total', pence: totalPence, emphasis: true });
  }

  if (visit && visit.booking_count > 1) {
    rows.push({
      key: 'visit-total',
      label: `Visit total (${visit.booking_count} services)`,
      pence: visit.total_pence,
      ...(visit.total_pence == null ? { note: 'Not known' } : {}),
      emphasis: true,
    });
  }

  const depositPaid =
    booking.deposit_status === 'Paid' && (booking.deposit_amount_pence ?? 0) > 0
      ? (booking.deposit_amount_pence as number)
      : null;
  if (depositPaid != null) {
    rows.push({ key: 'deposit', label: 'Deposit paid', pence: depositPaid });
  }

  const amountPaid = booking.amount_paid_pence ?? 0;
  if (amountPaid > 0 && amountPaid !== depositPaid) {
    rows.push({ key: 'paid', label: 'Paid so far', pence: amountPaid });
  }

  const balance = booking.balance_due_pence ?? null;
  const hasMoneyContext = totalPence != null || depositPaid != null || amountPaid > 0;
  if (balance != null && balance > 0) {
    rows.push({ key: 'balance', label: 'Outstanding', pence: balance, emphasis: true });
  } else if (balance === 0 && hasMoneyContext) {
    rows.push({ key: 'balance', label: 'Outstanding', pence: 0, emphasis: true });
  } else if (balance == null && hasMoneyContext) {
    rows.push({
      key: 'balance',
      label: 'Outstanding',
      pence: null,
      note: 'Enter an amount',
      emphasis: true,
    });
  }

  // No service, no price, no deposit, no payments → `rows` is already empty, so
  // the caller renders no price block at all. An unpriced service deliberately
  // still yields its "Price not set" row (see the note above).
  return rows;
}

/** Inputs for the §3.4 Take-payment button gate. */
export interface TakePaymentGateInput {
  /** `venue.in_person_payments_enabled` from the bootstrap (§6.6). */
  inPersonPaymentsEnabled: boolean;
  /** Venue-level appointments check (`isAppointmentExperience`); the charge route re-guards per booking. */
  isAppointmentVenue: boolean;
  /** Booking lifecycle status ('Cancelled' hides the button; nothing else does). */
  status: string;
  paymentState: BookingPaymentState | null | undefined;
  /** Outstanding balance; null = price unknown → the button still shows and staff enter the amount. */
  balanceDuePence: number | null | undefined;
}

/**
 * §3.4 rule 2, verbatim: the button renders ONLY when the venue is enabled,
 * this is an appointments venue, the booking is not cancelled, the state is
 * not paid/refunded, and there is (or may be) something left to pay.
 * Otherwise the button does not exist in the tree.
 */
export function canTakeInPersonPayment(input: TakePaymentGateInput): boolean {
  if (!input.inPersonPaymentsEnabled) return false;
  if (!input.isAppointmentVenue) return false;
  if (input.status === 'Cancelled') return false;
  if (input.paymentState === 'paid' || input.paymentState === 'refunded') return false;
  const balance = input.balanceDuePence ?? null;
  return balance === null || balance > 0;
}

/** Neutral labels for the whole-booking payment state (§5.5). */
export function bookingPaymentStateLabel(state: BookingPaymentState): string {
  switch (state) {
    case 'unpaid':
      return 'Unpaid';
    case 'deposit_paid':
      return 'Deposit paid';
    case 'partially_paid':
      return 'Partially paid';
    case 'paid':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
  }
}

/** Short labels for a ledger row's collection method. */
export function paymentMethodLabel(method: BookingPaymentRow['method']): string {
  switch (method) {
    case 'card_present':
      return 'Card';
    case 'cash':
      return 'Cash';
    case 'external':
      return 'Other';
    case 'online':
      return 'Online';
  }
}

/**
 * Rows the admin Refund action can target: only `succeeded` ledger rows.
 * (The charge route refunds card rows via Stripe and cash/external rows via a
 * direct ledger reversal; a non-succeeded row 409s server-side.)
 */
export function refundablePayments(
  payments: BookingPaymentRow[] | null | undefined,
): BookingPaymentRow[] {
  return (payments ?? []).filter((p) => p.status === 'succeeded');
}

/**
 * §5.7 — `payments[]` is VISIT-wide, so a row listed under this booking may
 * have been collected on a different service of the same visit. Staff need to
 * see which, because the amount and the service on screen won't match up.
 *
 * Returns null for a row anchored to the booking on screen (the normal case)
 * and for older payloads that omit `booking_id`.
 */
export function otherVisitLineNote(
  payment: BookingPaymentRow,
  openedBookingId: string,
): string | null {
  if (!payment.booking_id || payment.booking_id === openedBookingId) return null;
  return 'Collected on another service in this visit';
}

/**
 * §5.7 — the one-line "this covers the whole visit" note for the Take payment
 * sheet, or null when there is nothing extra to say.
 *
 * A multi-service visit is several bookings settled in ONE collection, so the
 * balance on screen is bigger than the opened service's price. Without this,
 * staff opening a £30 service and seeing "£90.00 due" have no way to tell
 * whether that is right. Returns null for a standalone appointment (count 0 or
 * 1) so the common case stays uncluttered.
 */
export function visitPaymentNote(
  visit: VisitPayment | null | undefined,
): string | null {
  const count = visit?.booking_count ?? 0;
  if (count < 2) return null;
  return `Covers all ${count} services in this visit`;
}
