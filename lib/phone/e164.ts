/**
 * E.164 phone numbers via libphonenumber-js, mirroring the web's
 * `src/lib/phone/e164.ts` + `default-country.ts` so the staff booking flow
 * validates and stores numbers the same way on both surfaces. The `min`
 * metadata bundle is enough for validity + formatting and keeps the JS bundle
 * small; it is pure JS, so an OTA update carries it.
 *
 * `lib/phone/normalize.ts` stays for the screens that never had a country
 * picker (a best-effort normaliser that never rejects); the booking wizard's
 * guest step uses this module through `PhoneWithCountryField`.
 */

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export type { CountryCode };

const GB_FIRST_ORDER = (a: string, b: string) => {
  if (a === 'GB') return -1;
  if (b === 'GB') return 1;
  return a.localeCompare(b);
};

/** ISO country codes with calling codes, GB first (NI/UK primary market). */
export function getSortedCountryCodes(): CountryCode[] {
  return (getCountries() as CountryCode[]).slice().sort(GB_FIRST_ORDER);
}

/** "+44" */
export function getDialCodeForCountry(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/** 🇬🇧 from "GB" (regional indicator symbols). */
export function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join('');
}

/** The countries the picker lists first (web `POPULAR`). */
export const POPULAR_COUNTRIES: CountryCode[] = ['GB', 'IE', 'US'];

/**
 * The default calling region for a venue's staff booking form, from its
 * currency (web `defaultPhoneCountryForVenueCurrency`): EUR venues default to
 * Ireland, everything else to the UK. A national-format number needs a region
 * to parse; an international one parses regardless.
 */
export function defaultPhoneCountryForVenueCurrency(currency?: string | null): CountryCode {
  const c = (currency ?? 'GBP').toUpperCase();
  if (c === 'EUR') return 'IE';
  return 'GB';
}

/** True when `code` is a country libphonenumber knows. */
export function isCountryCode(code: string | null | undefined): code is CountryCode {
  return !!code && (getCountries() as string[]).includes(code.toUpperCase());
}

/**
 * Parse user input to E.164, or null when it is not a valid number. Uses
 * `defaultCountry` for national numbers (07725… + GB → +447725…).
 */
export function normalizeToE164(input: string, defaultCountry: CountryCode = 'GB'): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.isValid()) return parsed.format('E.164');
  parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.isValid()) return parsed.format('E.164');
  return null;
}

/** The national number typed in the picker's field, as E.164 for the chosen country, or null when invalid. */
export function nationalToE164(national: string, country: CountryCode): string | null {
  const t = national.trim();
  if (!t) return null;
  const p = parsePhoneNumberFromString(t, country);
  return p?.isValid() ? p.format('E.164') : null;
}

/** "+44" + the typed digits, the raw the parent keeps while a number is still being typed or is invalid. */
export function composeNationalAndCountry(national: string, country: CountryCode): string {
  const digits = national.replace(/\D/g, '');
  if (!digits) return '';
  return `+${getCountryCallingCode(country)}${digits}`;
}

/**
 * The country whose calling code starts `digits` (the longest match; where
 * several countries share a code, the fallback, then a popular country, then
 * the first libphonenumber lists). Null when no code matches.
 */
function countryForCallingCodePrefix(
  digits: string,
  fallbackCountry: CountryCode,
): { country: CountryCode; callingCode: string } | null {
  let best: { country: CountryCode; callingCode: string } | null = null;
  const rank = (c: CountryCode) => (c === fallbackCountry ? 2 : POPULAR_COUNTRIES.includes(c) ? 1 : 0);
  for (const c of getCountries() as CountryCode[]) {
    const cc = getCountryCallingCode(c);
    if (!digits.startsWith(cc)) continue;
    if (!best || cc.length > best.callingCode.length || (cc.length === best.callingCode.length && rank(c) > rank(best.country))) {
      best = { country: c, callingCode: cc };
    }
  }
  return best;
}

export interface PhoneUiParts {
  countryCode: CountryCode;
  /** National significant number (no country code, no leading trunk 0). */
  nationalNumber: string;
}

/**
 * Split a stored value (E.164, a composed "+cc digits", or a legacy national
 * number) into country + national for the picker.
 */
export function parseStoredPhoneForUi(
  stored: string | null | undefined,
  fallbackCountry: CountryCode = 'GB',
): PhoneUiParts {
  if (!stored?.trim()) return { countryCode: fallbackCountry, nationalNumber: '' };
  const trimmed = stored.trim();

  let parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.isValid()) {
    return { countryCode: (parsed.country ?? fallbackCountry) as CountryCode, nationalNumber: parsed.nationalNumber };
  }
  parsed = parsePhoneNumberFromString(trimmed, fallbackCountry);
  if (parsed?.isValid()) {
    return { countryCode: (parsed.country ?? fallbackCountry) as CountryCode, nationalNumber: parsed.nationalNumber };
  }
  // A "+cc digits" that is not (yet) valid (half typed, or a wrong length):
  // keep the country its calling code names and the rest as typed, so the
  // picker never flips the country under the user's thumb.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '');
    const loose = parsePhoneNumberFromString(trimmed);
    if (loose?.country) {
      return { countryCode: loose.country as CountryCode, nationalNumber: loose.nationalNumber };
    }
    const match = countryForCallingCodePrefix(digits, fallbackCountry);
    if (match) {
      return { countryCode: match.country, nationalNumber: digits.slice(match.callingCode.length) };
    }
    return { countryCode: fallbackCountry, nationalNumber: digits };
  }
  // Legacy UK-ish: 44 prefix without the +.
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('44') && digits.length >= 12) {
    return { countryCode: 'GB', nationalNumber: digits.slice(2).replace(/^0+/, '') || digits.slice(2) };
  }
  // National number only: strip the trunk 0.
  return { countryCode: fallbackCountry, nationalNumber: digits.replace(/^0+/, '') };
}
