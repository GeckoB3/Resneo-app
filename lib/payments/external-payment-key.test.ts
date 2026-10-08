import { externalPaymentSignature, keyForExternalPayment } from '@/lib/payments/external-payment-key';

describe('keyForExternalPayment', () => {
  const sig = externalPaymentSignature({ bookingId: 'b1', method: 'cash', amountPence: 3000 });
  let n = 0;
  const mint = () => `key-${(n += 1)}`;

  it('reuses the held key for the same payment, so a retry records once', () => {
    const first = keyForExternalPayment(null, sig, mint);
    expect(keyForExternalPayment(first, sig, mint)).toBe(first);
  });

  it('mints a new key when the amount, the method or the booking changes', () => {
    const first = keyForExternalPayment(null, sig, mint);
    for (const changed of [
      externalPaymentSignature({ bookingId: 'b1', method: 'cash', amountPence: 2500 }),
      externalPaymentSignature({ bookingId: 'b1', method: 'external', amountPence: 3000 }),
      externalPaymentSignature({ bookingId: 'b2', method: 'cash', amountPence: 3000 }),
    ]) {
      expect(keyForExternalPayment(first, changed, mint).key).not.toBe(first.key);
    }
  });

  it('treats "the full balance" as its own amount', () => {
    expect(externalPaymentSignature({ bookingId: 'b1', method: 'cash', amountPence: undefined })).toBe('b1|cash|balance');
  });

  it('mints a valid attempt id by default', () => {
    expect(keyForExternalPayment(null, sig).key).toMatch(/^[0-9a-f-]{36}$/);
  });
});
