import {
  composeNationalAndCountry,
  countryFlag,
  defaultPhoneCountryForVenueCurrency,
  getDialCodeForCountry,
  getSortedCountryCodes,
  isCountryCode,
  nationalToE164,
  normalizeToE164,
  parseStoredPhoneForUi,
} from '@/lib/phone/e164';
import { countryName } from '@/lib/phone/country-names';

describe('country list', () => {
  it('puts GB first and knows every country by name', () => {
    const codes = getSortedCountryCodes();
    expect(codes[0]).toBe('GB');
    expect(codes.length).toBeGreaterThan(200);
    expect(codes.every((c) => countryName(c) !== c)).toBe(true);
    expect(getDialCodeForCountry('GB')).toBe('+44');
    expect(getDialCodeForCountry('IE')).toBe('+353');
    expect(countryFlag('GB')).toBe('🇬🇧');
    expect(isCountryCode('gb')).toBe(true);
    expect(isCountryCode('ZZ')).toBe(false);
  });
});

describe('defaultPhoneCountryForVenueCurrency (web parity)', () => {
  it('EUR venues default to Ireland, everything else to the UK', () => {
    expect(defaultPhoneCountryForVenueCurrency('EUR')).toBe('IE');
    expect(defaultPhoneCountryForVenueCurrency('GBP')).toBe('GB');
    expect(defaultPhoneCountryForVenueCurrency('USD')).toBe('GB');
    expect(defaultPhoneCountryForVenueCurrency(null)).toBe('GB');
  });
});

describe('normalizeToE164 / nationalToE164', () => {
  it('parses a national number with the default country', () => {
    expect(normalizeToE164('07725 123456', 'GB')).toBe('+447725123456');
    expect(normalizeToE164('087 123 4567', 'IE')).toBe('+353871234567');
    expect(nationalToE164('7725 123456', 'GB')).toBe('+447725123456');
  });
  it('parses an international number regardless of the default', () => {
    expect(normalizeToE164('+1 415 555 2671', 'GB')).toBe('+14155552671');
  });
  it('rejects a number that is not valid for the country', () => {
    expect(normalizeToE164('12345', 'GB')).toBeNull();
    expect(nationalToE164('12345', 'GB')).toBeNull();
    expect(normalizeToE164('', 'GB')).toBeNull();
  });
});

describe('composeNationalAndCountry / parseStoredPhoneForUi', () => {
  it('composes the raw and splits it back', () => {
    expect(composeNationalAndCountry('7725 123', 'GB')).toBe('+447725123');
    expect(composeNationalAndCountry('', 'GB')).toBe('');
    expect(parseStoredPhoneForUi('+447725123456')).toEqual({ countryCode: 'GB', nationalNumber: '7725123456' });
    expect(parseStoredPhoneForUi('+353871234567', 'GB')).toEqual({ countryCode: 'IE', nationalNumber: '871234567' });
    expect(parseStoredPhoneForUi('07725 123456', 'GB')).toEqual({ countryCode: 'GB', nationalNumber: '7725123456' });
    expect(parseStoredPhoneForUi('447725123456', 'GB')).toEqual({ countryCode: 'GB', nationalNumber: '7725123456' });
    expect(parseStoredPhoneForUi('', 'IE')).toEqual({ countryCode: 'IE', nationalNumber: '' });
  });
  it('keeps a half-typed composed number on its country', () => {
    expect(parseStoredPhoneForUi('+4477', 'IE')).toEqual({ countryCode: 'GB', nationalNumber: '77' });
  });
});
