/**
 * Payment attempt ids (Tap to Pay design doc §6.3c / §7.7).
 *
 * The charge route keys Stripe idempotency on `balance:{bookingId}:{attempt_id}`
 * and validates the value as a **UUID**, so this must always emit a
 * well-formed RFC 4122 v4 string. (The app's other id helper falls back to
 * `rule_<timestamp>` shapes, which the route would reject with a 400.)
 *
 * ONE id per user-initiated attempt: minted when staff tap the pay button, not
 * per network call, so a double-fired mutation reuses it (idempotent, one
 * PaymentIntent) while a later "take another payment" mints a fresh one and
 * legitimately creates a second, equal-amount payment.
 */

/** Random bytes from the platform CSPRNG when available, else Math.random. */
function randomBytes16(): Uint8Array {
  const bytes = new Uint8Array(16);
  const c = globalThis.crypto as { getRandomValues?: (a: Uint8Array) => Uint8Array } | undefined;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** A fresh RFC 4122 version-4 UUID. */
export function newPaymentAttemptId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const b = randomBytes16();
  // Version 4 + RFC 4122 variant bits.
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) hex.push((b[i] ?? 0).toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/** RFC 4122 v4 shape check (used by tests and defensive callers). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
