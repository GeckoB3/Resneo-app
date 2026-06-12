/**
 * Lightweight phone normalization for the booking wizard.
 *
 * The web app uses `libphonenumber-js` (`normalizeToE164`) for full E.164
 * validation. That library is not a mobile dependency, so this is a best-effort
 * E.164-ish normaliser that matches the web's *intent*: trim, strip formatting,
 * and prefix the default dialling code for national numbers. It never throws and
 * always returns a stored-consistent string (or the trimmed input if it can't
 * confidently normalise) so a booking is never blocked by formatting.
 */

/** Default dialling code by country (GB/NI primary market). */
const DIAL_CODES: Record<string, string> = {
  GB: '44',
  IE: '353',
  US: '1',
};

/**
 * Best-effort E.164-ish normalisation.
 * - Already `+`-prefixed international → keep digits, re-prefix `+`.
 * - National number with a leading trunk `0` → strip it and prefix the country
 *   dialling code (e.g. `07725 123456` + GB → `+447725123456`).
 * - Otherwise return the cleaned input so storage stays consistent.
 */
export function normalizePhone(input: string, defaultCountry = 'GB'): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // International form: keep digits after the +.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const dial = DIAL_CODES[defaultCountry] ?? null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (dial) {
    // Already starts with the dial code (e.g. 447725…) → just prefix +.
    if (digits.startsWith(dial)) {
      return `+${digits}`;
    }
    // National with leading trunk 0 → swap for the dial code.
    if (digits.startsWith('0')) {
      return `+${dial}${digits.replace(/^0+/, '')}`;
    }
    // Bare national digits → prefix the dial code.
    return `+${dial}${digits}`;
  }

  return `+${digits}`;
}
