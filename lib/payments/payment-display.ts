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

import type { BookingPaymentRow, BookingPaymentState } from '@/types/booking-detail';

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
