/**
 * The booking's owed-deposit line and "Keep without deposit" (web deposit-handling plan DH2, DH4):
 * a waiting booking says when it is cancelled; one staff kept says it stays booked.
 */
import {
  canKeepWithoutDeposit,
  keepWithoutDepositLabel,
  keepWithoutDepositQuestion,
  owedDepositStatusLine,
} from '@/lib/booking/deposit-owed-line';

const NOW = new Date('2026-12-01T10:00:00Z');
const base = {
  status: 'Pending',
  depositStatus: 'Pending',
  depositAmountPence: 2000,
  isFullPayment: false,
  source: 'phone',
  createdAt: '2026-12-01T09:00:00Z',
  linkedVisitId: null,
  communications: [
    { message_type: 'deposit_request_email', status: 'sent', created_at: '2026-12-01T09:12:00Z' },
  ],
  currency: 'GBP',
  timeZone: 'Europe/London',
  now: NOW,
};

describe('owedDepositStatusLine', () => {
  it('a waiting booking says the stored deadline', () => {
    expect(owedDepositStatusLine({ ...base, depositCancelAt: '2026-12-02T09:12:00Z' })).toBe(
      'Deposit £20.00 owed. Payment link sent today at 09:12. If it is not paid by tomorrow at 09:12, the booking is cancelled.',
    );
  });

  it('a kept booking stays booked, and a full payment is never called a deposit', () => {
    expect(owedDepositStatusLine({ ...base, status: 'Booked', isFullPayment: true, depositCancelAt: null })).toBe(
      'Payment £20.00 owed. Payment link sent today at 09:12. The booking stays booked if it is not paid.',
    );
  });

  it('a passed deadline says it will be cancelled soon', () => {
    expect(owedDepositStatusLine({ ...base, communications: null, depositCancelAt: '2026-12-01T09:00:00Z' })).toBe(
      'Deposit £20.00 owed. Its time to pay has passed, so the booking will be cancelled soon if it stays unpaid.',
    );
  });

  it('a booking made before deadlines were stored keeps the 24-hour rule', () => {
    expect(owedDepositStatusLine({ ...base, communications: [], depositCancelAt: null })).toBe(
      'Deposit £20.00 owed. No payment link has been sent yet. If it is not paid by tomorrow at 09:00, the booking is cancelled.',
    );
  });

  it('says nothing when nothing is owed or the booking is over', () => {
    expect(owedDepositStatusLine({ ...base, depositStatus: 'Paid' })).toBeNull();
    expect(owedDepositStatusLine({ ...base, status: 'Cancelled' })).toBeNull();
    expect(owedDepositStatusLine({ ...base, depositAmountPence: 0 })).toBeNull();
  });

  it("leaves a visit's part to the visit's pay link", () => {
    expect(owedDepositStatusLine({ ...base, coveredByVisitLink: true })).toBe(
      "Deposit £20.00 owed. The visit's payment link covers it.",
    );
  });
});

describe('Keep without deposit', () => {
  it('applies to a Pending booking owing its deposit, not a visit across businesses', () => {
    const row = { status: 'Pending', deposit_status: 'Pending', deposit_amount_pence: 2000, linked_visit_id: null };
    expect(canKeepWithoutDeposit(row)).toBe(true);
    expect(canKeepWithoutDeposit({ ...row, deposit_status: 'Failed' })).toBe(true);
    expect(canKeepWithoutDeposit({ ...row, status: 'Booked' })).toBe(false);
    expect(canKeepWithoutDeposit({ ...row, deposit_status: 'Paid' })).toBe(false);
    expect(canKeepWithoutDeposit({ ...row, deposit_amount_pence: 0 })).toBe(false);
    expect(canKeepWithoutDeposit({ ...row, linked_visit_id: 'v1' })).toBe(false);
  });

  it('asks in the web words', () => {
    expect(keepWithoutDepositLabel('deposit')).toBe('Keep without deposit');
    expect(keepWithoutDepositLabel('payment')).toBe('Keep without payment');
    expect(keepWithoutDepositQuestion({ word: 'deposit', amountPence: 2000, currency: 'GBP', guestName: 'Jo Bloggs' })).toEqual({
      title: 'Keep without the deposit?',
      message:
        'The booking stays booked even if the deposit is not paid. Jo Bloggs is sent a confirmation that says the £20.00 deposit is still due, with the payment link.',
      confirmLabel: 'Keep booking',
    });
    expect(keepWithoutDepositQuestion({ word: 'payment', amountPence: null, guestName: '' }).message).toBe(
      'The booking stays booked even if the payment is not paid. The client is sent a confirmation that says the payment is still due, with the payment link.',
    );
  });
});
