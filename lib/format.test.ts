import {
  currencySymbol,
  formatDurationMinutes,
  formatPence,
  formatPositivePence,
  getActiveVenueCurrency,
  parsePoundsToPence,
  penceToPoundsInput,
  setActiveVenueCurrency,
} from '@/lib/format';

/** QA 2026-11-08 DEVICE-F13: the app showed pounds to euro businesses and their clients. */
describe('money in the business currency', () => {
  afterEach(() => setActiveVenueCurrency(null));

  it('formats in the currency named, any case', () => {
    expect(formatPence(1250, 'EUR')).toBe('€12.50');
    expect(formatPence(1250, 'eur')).toBe('€12.50');
    expect(formatPence(1250, 'GBP')).toBe('£12.50');
    expect(formatPositivePence(500, 'EUR')).toBe('€5.00');
  });

  it("follows the signed-in business's currency when none is named", () => {
    setActiveVenueCurrency('EUR');
    expect(getActiveVenueCurrency()).toBe('EUR');
    expect(formatPence(1250)).toBe('€12.50');
    expect(currencySymbol()).toBe('€');
    // A named currency still wins (a client's booking at another business).
    expect(formatPence(1250, 'GBP')).toBe('£12.50');
    setActiveVenueCurrency(null);
    expect(formatPence(1250)).toBe('£12.50');
    expect(currencySymbol()).toBe('£');
  });

  it('parses a typed euro amount', () => {
    expect(parsePoundsToPence('€12.50')).toBe(1250);
  });
});

describe('formatPence', () => {
  it('formats pence as GBP currency', () => {
    expect(formatPence(1250)).toBe('£12.50');
    expect(formatPence(99)).toBe('£0.99');
    expect(formatPence(0)).toBe('£0.00');
    expect(formatPence(100000)).toBe('£1,000.00');
  });

  it('returns null for null/undefined so callers can hide the row', () => {
    expect(formatPence(null)).toBeNull();
    expect(formatPence(undefined)).toBeNull();
  });
});

describe('formatPositivePence', () => {
  it('treats zero and negatives as "no amount"', () => {
    expect(formatPositivePence(0)).toBeNull();
    expect(formatPositivePence(-500)).toBeNull();
    expect(formatPositivePence(null)).toBeNull();
  });

  it('formats positive amounts', () => {
    expect(formatPositivePence(1250)).toBe('£12.50');
  });
});

describe('parsePoundsToPence', () => {
  it('parses pounds strings to integer pence', () => {
    expect(parsePoundsToPence('12.50')).toBe(1250);
    expect(parsePoundsToPence('10')).toBe(1000);
    expect(parsePoundsToPence(' 5 ')).toBe(500);
  });

  it('strips a leading £', () => {
    expect(parsePoundsToPence('£12.50')).toBe(1250);
  });

  it('rounds to the nearest pence', () => {
    expect(parsePoundsToPence('12.999')).toBe(1300);
    expect(parsePoundsToPence('0.005')).toBe(1);
  });

  it('returns null for empty input (clear), undefined for invalid', () => {
    expect(parsePoundsToPence('')).toBeNull();
    expect(parsePoundsToPence('   ')).toBeNull();
    expect(parsePoundsToPence('abc')).toBeUndefined();
    expect(parsePoundsToPence('-1')).toBeUndefined();
  });
});

describe('penceToPoundsInput', () => {
  it('renders a 2dp string for inputs, empty when absent', () => {
    expect(penceToPoundsInput(1250)).toBe('12.50');
    expect(penceToPoundsInput(0)).toBe('0.00');
    expect(penceToPoundsInput(null)).toBe('');
    expect(penceToPoundsInput(undefined)).toBe('');
  });
});

describe('formatDurationMinutes', () => {
  it('formats hours and minutes', () => {
    expect(formatDurationMinutes(90)).toBe('1h 30m');
    expect(formatDurationMinutes(45)).toBe('45m');
    expect(formatDurationMinutes(60)).toBe('1h');
    expect(formatDurationMinutes(120)).toBe('2h');
    expect(formatDurationMinutes(0)).toBe('0m');
    expect(formatDurationMinutes(125)).toBe('2h 5m');
  });
});
