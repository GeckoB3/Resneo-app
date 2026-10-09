/**
 * Gift voucher codes as staff type them (UX spec §20.3, plan §4.33.2), kept in step with the web
 * till's `src/components/pos/vouchers/voucher-code.ts`. A code is never put in an address, a log,
 * a query key or storage: it lives only in the field and in the body of the look-up, and the field
 * is cleared once the voucher is found.
 */

/** Digits 2 to 9 and the letters without I and O (the server's alphabet). */
export const VOUCHER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const VOUCHER_CODE_LENGTH = 12;
/** A venue's own code for a voucher it sold before ResNeo: 4 to 32 letters and numbers. */
export const OWN_CODE_MIN = 4;
export const OWN_CODE_MAX = 32;

/** Upper case, with spaces, dashes and other separators removed. */
export function normaliseVoucherCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, '');
}

/** True when the input is a ResNeo code: twelve characters of the alphabet once normalised. */
export function isResneoVoucherCode(input: string): boolean {
  const n = normaliseVoucherCode(input);
  if (n.length !== VOUCHER_CODE_LENGTH) return false;
  for (const ch of n) if (!VOUCHER_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * True when the input is worth looking up: a ResNeo code, or a venue's own code of 4 to 32
 * letters and numbers. Anything else shows `vpay.code.invalid` before anything is sent.
 */
export function isPlausibleVoucherCode(input: string): boolean {
  const n = normaliseVoucherCode(input);
  return n.length >= OWN_CODE_MIN && n.length <= OWN_CODE_MAX && /^[A-Z0-9]+$/.test(n);
}

/** `7k4qm2xd9hpa` as `7K4Q-M2XD-9HPA`; other lengths in groups of four. */
export function formatVoucherCode(code: string): string {
  const n = normaliseVoucherCode(code);
  return n.match(/.{1,4}/g)?.join('-') ?? n;
}

/**
 * What the code field shows while someone types: upper case, grouped in fours as they go, so a
 * typed code reads like the printed one. A code longer than twelve is left ungrouped (a venue's
 * own code keeps its shape), and anything with other characters is only upper-cased, so the
 * person can see what they typed and the check can say it is not a code.
 */
export function tidyCodeInput(raw: string): string {
  const n = normaliseVoucherCode(raw);
  if (!/^[A-Z0-9]*$/.test(n)) return raw.toUpperCase();
  if (n.length > VOUCHER_CODE_LENGTH) return n;
  return formatVoucherCode(n);
}

/** Why a code cannot be looked up yet: nothing typed, or not a code at all. */
export function codeInputProblem(input: string): 'empty' | 'invalid' | null {
  if (!normaliseVoucherCode(input)) return 'empty';
  return isPlausibleVoucherCode(input) ? null : 'invalid';
}
