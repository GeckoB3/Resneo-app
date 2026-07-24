import { isUuid, newPaymentAttemptId } from '@/lib/payments/attempt-id';

/**
 * The charge route validates `attempt_id` with `z.string().uuid()` and keys
 * Stripe idempotency on it, so a malformed id is a hard 400 and a colliding id
 * is a money bug. These tests pin both properties.
 */
describe('newPaymentAttemptId', () => {
  it('emits a valid RFC 4122 v4 UUID', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isUuid(newPaymentAttemptId())).toBe(true);
    }
  });

  it('emits a distinct id per call (one per payment attempt)', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newPaymentAttemptId()));
    expect(ids.size).toBe(200);
  });

  it('still produces a valid v4 uuid without a platform CSPRNG', () => {
    const original = globalThis.crypto;
    // Simulate an RN runtime with no crypto at all — the fallback must still
    // satisfy the server's uuid check rather than emitting a `rule_…` shape.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const id = newPaymentAttemptId();
      expect(isUuid(id)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('isUuid', () => {
  it('rejects the app-style non-uuid ids the charge route would 400 on', () => {
    expect(isUuid('rule_1758000000000_abc1234')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('accepts a canonical v4 uuid', () => {
    expect(isUuid('3f4a2c1e-9b7d-4a55-8c21-0f9e2d5a7b31')).toBe(true);
  });
});
