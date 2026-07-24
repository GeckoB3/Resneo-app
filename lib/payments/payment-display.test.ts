import {
  bookingPaymentStateLabel,
  canTakeInPersonPayment,
  paymentMethodLabel,
  refundablePayments,
} from '@/lib/payments/payment-display';
import type { BookingPaymentRow } from '@/types/booking-detail';

/**
 * §3.4 Take-payment gate + neutral state labels (Tap to Pay design doc).
 * The gate is the enforcement point for "frictionless & optional": the button
 * must simply not exist in every off case.
 */

const BASE = {
  inPersonPaymentsEnabled: true,
  isAppointmentVenue: true,
  status: 'Booked',
  paymentState: 'deposit_paid' as const,
  balanceDuePence: 2500,
};

describe('canTakeInPersonPayment (§3.4 rule 2)', () => {
  it('shows for an enabled appointments venue with an outstanding balance', () => {
    expect(canTakeInPersonPayment(BASE)).toBe(true);
  });

  it('hides when the venue flag is off (frictionless off)', () => {
    expect(canTakeInPersonPayment({ ...BASE, inPersonPaymentsEnabled: false })).toBe(false);
  });

  it('hides for non-appointment venues', () => {
    expect(canTakeInPersonPayment({ ...BASE, isAppointmentVenue: false })).toBe(false);
  });

  it('hides on cancelled bookings only; other statuses never gate it', () => {
    expect(canTakeInPersonPayment({ ...BASE, status: 'Cancelled' })).toBe(false);
    for (const status of ['Pending', 'Booked', 'Confirmed', 'Seated', 'Completed', 'No-Show']) {
      expect(canTakeInPersonPayment({ ...BASE, status })).toBe(true);
    }
  });

  it('hides when already paid or refunded', () => {
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'paid' })).toBe(false);
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'refunded' })).toBe(false);
  });

  it('unpaid / partially_paid / missing state stay actionable', () => {
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'unpaid' })).toBe(true);
    expect(canTakeInPersonPayment({ ...BASE, paymentState: 'partially_paid' })).toBe(true);
    expect(canTakeInPersonPayment({ ...BASE, paymentState: null })).toBe(true);
  });

  it('hides at zero balance; shows when the balance is unknown (null → staff enter the amount)', () => {
    expect(canTakeInPersonPayment({ ...BASE, balanceDuePence: 0 })).toBe(false);
    expect(canTakeInPersonPayment({ ...BASE, balanceDuePence: null })).toBe(true);
    expect(canTakeInPersonPayment({ ...BASE, balanceDuePence: undefined })).toBe(true);
  });
});

describe('labels', () => {
  it('maps every payment state to a neutral label', () => {
    expect(bookingPaymentStateLabel('unpaid')).toBe('Unpaid');
    expect(bookingPaymentStateLabel('deposit_paid')).toBe('Deposit paid');
    expect(bookingPaymentStateLabel('partially_paid')).toBe('Partially paid');
    expect(bookingPaymentStateLabel('paid')).toBe('Paid');
    expect(bookingPaymentStateLabel('refunded')).toBe('Refunded');
  });

  it('maps ledger methods to short labels', () => {
    expect(paymentMethodLabel('card_present')).toBe('Card');
    expect(paymentMethodLabel('cash')).toBe('Cash');
    expect(paymentMethodLabel('external')).toBe('Other');
    expect(paymentMethodLabel('online')).toBe('Online');
  });
});

describe('refundablePayments', () => {
  const row = (over: Partial<BookingPaymentRow>): BookingPaymentRow => ({
    id: 'p1',
    method: 'card_present',
    status: 'succeeded',
    amount_pence: 2500,
    note: null,
    created_at: '2026-07-23T10:00:00Z',
    ...over,
  });

  it('keeps only succeeded rows (any method)', () => {
    const rows = [
      row({ id: 'a', status: 'succeeded', method: 'card_present' }),
      row({ id: 'b', status: 'succeeded', method: 'cash' }),
      row({ id: 'c', status: 'pending' }),
      row({ id: 'd', status: 'failed' }),
      row({ id: 'e', status: 'refunded' }),
    ];
    expect(refundablePayments(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('tolerates a missing list', () => {
    expect(refundablePayments(undefined)).toEqual([]);
    expect(refundablePayments(null)).toEqual([]);
  });
});
