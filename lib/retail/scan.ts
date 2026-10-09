/**
 * Camera scanning (POS app step 4 over the air, UX spec §13.6 "Camera scanning"): the pure parts,
 * kept apart from the camera so they can be tested without one.
 *
 * - What a scan may stand for. A UPC-A code is twelve digits, and the same product read as an
 *   EAN-13 is the same digits with a 0 in front: iPhones read UPC-A that way, Android reports it as
 *   twelve digits, and a keyboard-mode scanner types whichever it is set to. So a twelve-digit code
 *   is also tried with the 0, and a thirteen-digit code starting with 0 also without it. The scanned
 *   form always comes first.
 * - Continuous scanning. The camera reports the same code many times a second while it is in view,
 *   so a code is taken once, then not again until it has been out of view for a moment or another
 *   code was taken (a second unit of the same product is the next scan after a pause).
 */

/** The forms a scanned or typed code may be stored under, the scanned one first. */
export function scanCandidates(raw: string): string[] {
  const code = raw.trim();
  if (!code) return [];
  if (/^\d{12}$/.test(code)) return [code, `0${code}`];
  if (/^0\d{12}$/.test(code)) return [code, code.slice(1)];
  return [code];
}

/** Whether a stored barcode is one of the forms of a scanned code. */
export function sameBarcode(stored: string, scanned: string): boolean {
  const s = stored.trim();
  return s.length > 0 && scanCandidates(scanned).includes(s);
}

/** Barcode types the till, stocktakes and deliveries read: product codes on packaging. */
export const PRODUCT_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14'] as const;

/** A gift voucher's PDF carries its code as a QR code (Pass V, UX spec §13.13). */
export const VOUCHER_BARCODE_TYPES = ['qr', 'code128'] as const;

/** A pickup code is a QR code on the customer's confirmation (UX spec §8.4). */
export const PICKUP_BARCODE_TYPES = ['qr'] as const;

export interface ScanGate {
  /** The code taken last, and when it was last seen in view. */
  lastCode: string | null;
  lastSeenAt: number;
}

export const NEW_SCAN_GATE: ScanGate = { lastCode: null, lastSeenAt: 0 };

/** How long a code must be out of view before the same code counts again. */
export const SAME_CODE_PAUSE_MS = 1500;

/**
 * Whether the camera's report of `code` at `now` is a new scan. Returns the gate to keep: the same
 * code seen again keeps the gate fresh, so holding a box in front of the camera counts it once.
 */
export function acceptScan(gate: ScanGate, raw: string, now: number): { accept: boolean; gate: ScanGate } {
  const code = raw.trim();
  if (!code) return { accept: false, gate };
  if (gate.lastCode === code && now - gate.lastSeenAt < SAME_CODE_PAUSE_MS) {
    return { accept: false, gate: { lastCode: code, lastSeenAt: now } };
  }
  return { accept: true, gate: { lastCode: code, lastSeenAt: now } };
}
