import type { Symbology } from '@/types/retail';

/**
 * Product barcodes (POS plan §4.12; UX spec §6.3 `var.barcodes`), as the web checks them
 * (`src/lib/retail/barcode.ts`): EAN-13 and UPC-A check digits are validated; Code 128 is accepted
 * as typed (printable characters, up to 64). The server checks again.
 */

/** The GS1 check digit for the digits before it (EAN-13 and UPC-A share the rule). */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  // Weights 3 and 1 alternate from the rightmost digit of the body.
  for (let i = 0; i < body.length; i += 1) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGs1(code: string, length: 12 | 13): boolean {
  if (!new RegExp(`^\\d{${length}}$`).test(code)) return false;
  return gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** EAN-13 for 13 digits, UPC-A for 12, otherwise Code 128. */
export function detectSymbology(code: string): Symbology {
  const t = code.trim();
  if (/^\d{13}$/.test(t)) return 'ean13';
  if (/^\d{12}$/.test(t)) return 'upca';
  return 'code128';
}

export const BARCODE_CHECK_DIGIT_SENTENCE = "That barcode's check digit is wrong. Check it and try again.";

/** Null when the barcode is acceptable for its symbology; otherwise the web's sentence. */
export function barcodeProblem(code: string, symbology: Symbology = detectSymbology(code)): string | null {
  const t = code.trim();
  if (!t) return 'Enter the barcode.';
  if (symbology === 'ean13') return isValidGs1(t, 13) ? null : BARCODE_CHECK_DIGIT_SENTENCE;
  if (symbology === 'upca') return isValidGs1(t, 12) ? null : BARCODE_CHECK_DIGIT_SENTENCE;
  if (!/^[\x21-\x7E]{1,64}$/.test(t)) return 'Use letters, numbers and symbols only, with no spaces.';
  return null;
}
