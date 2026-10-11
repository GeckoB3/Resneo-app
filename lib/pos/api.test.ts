/**
 * A reused request id (web, 2026-10-09): 409 `CONFLICT` with `reason: 'request_reused'`. It is a
 * refusal that took nothing, never a lost answer, so the screens make a new id and read the sale.
 */
import { ApiError } from '@/lib/api/client';
import { isRequestReused, keepsRequestId } from '@/lib/pos/api';

const SENTENCE = 'That request was already used for a different payment, so nothing new was taken. Refresh the sale and try again.';

describe('keepsRequestId', () => {
  it('keeps the id after a lost answer or a server error, and starts afresh after a refusal', () => {
    expect(keepsRequestId(new TypeError('Network request failed'))).toBe(true);
    expect(keepsRequestId(new ApiError('Something went wrong.', 500, { error: 'Something went wrong.' }))).toBe(true);
    expect(keepsRequestId(new ApiError('Busy', 503, {}))).toBe(true);
    expect(keepsRequestId(new ApiError('The card question failed.', 502, {}))).toBe(false);
    expect(keepsRequestId(new ApiError('Declined', 402, { code: 'CARD_DECLINED' }))).toBe(false);
    expect(keepsRequestId(new ApiError('Too much', 409, { code: 'POS_PAYMENT_TOO_LARGE' }))).toBe(false);
  });
});

describe('isRequestReused', () => {
  it('knows the 409 CONFLICT with reason request_reused', () => {
    expect(isRequestReused(new ApiError(SENTENCE, 409, { error: SENTENCE, code: 'CONFLICT', reason: 'request_reused' }))).toBe(true);
  });

  it('knows the older POS_REQUEST_REUSED code', () => {
    expect(isRequestReused(new ApiError(SENTENCE, 409, { error: SENTENCE, code: 'POS_REQUEST_REUSED' }))).toBe(true);
  });

  it('is false for other conflicts, lost answers and plain errors', () => {
    expect(isRequestReused(new ApiError('x', 409, { error: 'x', code: 'CONFLICT' }))).toBe(false);
    expect(isRequestReused(new ApiError('Network request failed', 0))).toBe(false);
    expect(isRequestReused(new ApiError('x', 408))).toBe(false);
    expect(isRequestReused(new Error(SENTENCE))).toBe(false);
  });
});
