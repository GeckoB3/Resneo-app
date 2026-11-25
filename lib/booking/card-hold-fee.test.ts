import {
  CARD_HOLD_PERCENT_MIN_FEE_PENCE,
  cardHoldFeeFor,
  cardHoldFeePercentOf,
  cardHoldPercentExampleLine,
  cardHoldPercentLabel,
  parseCardHoldPercentInput,
} from '@/lib/booking/card-hold-fee';

/**
 * A card hold's no-show fee is a fixed amount or a percentage of the price plus add-ons
 * (web Docs/card-hold-percentage-fee-plan.md). These mirror the web resolver's rules.
 */

describe('cardHoldFeePercentOf', () => {
  it('reads a whole percent from 1 to 100', () => {
    expect(cardHoldFeePercentOf({ card_hold_fee_percent: 1 })).toBe(1);
    expect(cardHoldFeePercentOf({ card_hold_fee_percent: 50 })).toBe(50);
    expect(cardHoldFeePercentOf({ card_hold_fee_percent: 100 })).toBe(100);
  });

  it('treats null, absent or out-of-range values as a fixed fee', () => {
    expect(cardHoldFeePercentOf({ card_hold_fee_percent: null })).toBeNull();
    expect(cardHoldFeePercentOf({})).toBeNull();
    expect(cardHoldFeePercentOf(null)).toBeNull();
    expect(cardHoldFeePercentOf({ card_hold_fee_percent: 0 })).toBeNull();
    expect(cardHoldFeePercentOf({ card_hold_fee_percent: 101 })).toBeNull();
  });
});

describe('cardHoldFeeFor', () => {
  it('keeps a fixed fee as it is, leaving add-ons out', () => {
    expect(cardHoldFeeFor({ price_pence: 9000, deposit_pence: 2000 }, 1500)).toBe(2000);
    expect(cardHoldFeeFor({ price_pence: 9000, deposit_pence: 2000, card_hold_fee_percent: null }, 1500)).toBe(2000);
  });

  it('gives 0 for a missing or negative fixed fee', () => {
    expect(cardHoldFeeFor({ price_pence: 9000 })).toBe(0);
    expect(cardHoldFeeFor({ deposit_pence: -5 })).toBe(0);
  });

  it('works out a percentage of the price', () => {
    expect(cardHoldFeeFor({ price_pence: 9000, card_hold_fee_percent: 50 })).toBe(4500);
  });

  it('includes the add-ons chosen in a percentage', () => {
    // £60 cut, add-ons £20 + £10: 50% of £90.
    expect(cardHoldFeeFor({ price_pence: 6000, card_hold_fee_percent: 50 }, 3000)).toBe(4500);
  });

  it('ignores the fixed fee in percentage mode', () => {
    expect(cardHoldFeeFor({ price_pence: 4000, deposit_pence: 2500, card_hold_fee_percent: 10 })).toBe(400);
  });

  it('rounds to the nearest penny', () => {
    // 33% of £12.35 = 407.55p
    expect(cardHoldFeeFor({ price_pence: 1235, card_hold_fee_percent: 33 })).toBe(408);
    // 15% of £10.03 = 150.45p
    expect(cardHoldFeeFor({ price_pence: 1003, card_hold_fee_percent: 15 })).toBe(150);
  });

  it('takes no hold when the result is under 50p', () => {
    expect(cardHoldFeeFor({ price_pence: 900, card_hold_fee_percent: 5 })).toBe(0);
    expect(cardHoldFeeFor({ price_pence: 1000, card_hold_fee_percent: 5 })).toBe(CARD_HOLD_PERCENT_MIN_FEE_PENCE);
  });

  it('takes no hold for a percentage with no price', () => {
    expect(cardHoldFeeFor({ price_pence: null, card_hold_fee_percent: 50 })).toBe(0);
  });
});

describe('cardHoldPercentLabel', () => {
  it('names the percentage', () => {
    expect(cardHoldPercentLabel(50)).toBe('50% of the price');
  });
});

describe('parseCardHoldPercentInput', () => {
  it('accepts a whole number from 1 to 100, with or without a % sign', () => {
    expect(parseCardHoldPercentInput('50')).toBe(50);
    expect(parseCardHoldPercentInput(' 25% ')).toBe(25);
    expect(parseCardHoldPercentInput('1')).toBe(1);
    expect(parseCardHoldPercentInput('100')).toBe(100);
  });

  it('refuses anything else', () => {
    expect(parseCardHoldPercentInput('')).toBeNull();
    expect(parseCardHoldPercentInput('0')).toBeNull();
    expect(parseCardHoldPercentInput('101')).toBeNull();
    expect(parseCardHoldPercentInput('12.5')).toBeNull();
    expect(parseCardHoldPercentInput('-5')).toBeNull();
    expect(parseCardHoldPercentInput('abc')).toBeNull();
  });
});

describe('cardHoldPercentExampleLine', () => {
  it('shows the fee on a booking at the price', () => {
    expect(cardHoldPercentExampleLine(50, 9000)).toBe('On a £90.00 booking: £45.00');
  });

  it('says when the fee would be too small to hold a card', () => {
    expect(cardHoldPercentExampleLine(5, 900)).toBe('On a £9.00 booking: no fee, as it would be under £0.50.');
  });

  it('shows nothing without a price or a percent', () => {
    expect(cardHoldPercentExampleLine(50, null)).toBeNull();
    expect(cardHoldPercentExampleLine(50, 0)).toBeNull();
    expect(cardHoldPercentExampleLine(null, 9000)).toBeNull();
  });
});
