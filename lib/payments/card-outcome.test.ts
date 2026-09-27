import {
  cardOutcomeOf,
  cardPaymentError,
  cardReceiptText,
  cardSummaryOf,
  isCardPaymentFailure,
} from '@/lib/payments/card-outcome';

describe('cardOutcomeOf', () => {
  it('reads a decline code or a declined error code as declined', () => {
    expect(cardOutcomeOf({ code: 'X', apiError: { declineCode: 'insufficient_funds' } })).toBe('declined');
    expect(cardOutcomeOf({ code: 'DECLINED_BY_READER' })).toBe('declined');
  });

  it('reads timeouts as timed out', () => {
    expect(cardOutcomeOf({ code: 'CARD_READ_TIMED_OUT' })).toBe('timed_out');
    expect(cardOutcomeOf({ code: 'REQUEST_TIMED_OUT' })).toBe('timed_out');
  });

  it('treats anything else as not completed', () => {
    expect(cardOutcomeOf({ code: 'CANCELED' })).toBe('not_completed');
    expect(cardOutcomeOf(undefined)).toBe('not_completed');
  });
});

describe('cardSummaryOf', () => {
  it('prefers the payment method, then the charge', () => {
    expect(
      cardSummaryOf({ paymentMethod: { cardPresentDetails: { brand: 'visa', last4: '4242' } } } as never),
    ).toEqual({ brand: 'visa', last4: '4242' });
    expect(
      cardSummaryOf({
        charges: [{ paymentMethodDetails: { cardPresentDetails: { brand: 'amex', last4: '0005' } } }],
      } as never),
    ).toEqual({ brand: 'amex', last4: '0005' });
    expect(cardSummaryOf(null)).toBeNull();
  });
});

describe('cardPaymentError', () => {
  it('is still an Error, and carries how the payment ended', () => {
    const e = cardPaymentError('Declined.', {
      outcome: 'declined',
      amountPence: 100,
      paymentIntentId: 'pi_1',
      card: null,
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('Declined.');
    expect(isCardPaymentFailure(e)).toBe(true);
    expect(isCardPaymentFailure(new Error('plain'))).toBe(false);
  });
});

describe('cardReceiptText', () => {
  it('writes a confidential receipt for any outcome', () => {
    const text = cardReceiptText({
      venueName: 'Salon',
      amountPence: 4500,
      outcome: 'declined',
      at: new Date(2026, 8, 27, 14, 5),
      paymentIntentId: 'pi_9',
      card: { brand: 'visa', last4: '4242' },
    });
    expect(text).toContain('Receipt from Salon');
    expect(text).toContain('Card payment: Declined');
    expect(text).toContain('£45.00');
    expect(text).toContain('visa •••• 4242');
    expect(text).toContain('27 Sep 2026, 14:05');
    expect(text).toContain('Reference: pi_9');
  });
});
