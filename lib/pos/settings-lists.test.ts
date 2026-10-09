import { missingPaymentTypeSuggestions, reorderWrites } from '@/lib/pos/settings-lists';

describe('payment type suggestions', () => {
  it('offers the ones the venue does not have, ignoring case', () => {
    expect(missingPaymentTypeSuggestions([{ name: 'bank TRANSFER' }], false)).toEqual(['Card (another terminal)', 'Paper voucher']);
  });

  it('leaves out Paper voucher while gift vouchers are on', () => {
    expect(missingPaymentTypeSuggestions([], true)).toEqual(['Card (another terminal)', 'Bank transfer']);
  });
});

describe('reorderWrites', () => {
  const rows = [
    { id: 'a', sort_order: 0, version: 3 },
    { id: 'b', sort_order: 0, version: 1 },
    { id: 'c', sort_order: 2, version: 7 },
  ];

  it('renumbers so the two swap even with equal sort orders, each with its own version', () => {
    // b moves up: order b, a, c. b stays 0, a becomes 1, c stays 2.
    expect(reorderWrites(rows, 1, -1)).toEqual([{ id: 'a', version: 3, sort_order: 1 }]);
    // c moves up: order a, c, b.
    expect(reorderWrites(rows, 2, -1)).toEqual([
      { id: 'b', version: 1, sort_order: 2 },
      { id: 'c', version: 7, sort_order: 1 },
    ]);
  });

  it('does nothing past either end', () => {
    expect(reorderWrites(rows, 0, -1)).toEqual([]);
    expect(reorderWrites(rows, 2, 1)).toEqual([]);
  });
});
