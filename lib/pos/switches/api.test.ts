/**
 * The switch route's refusals, read from their codes (contract: the web's
 * `src/lib/pos/switches/types.ts` `PosFeatureSwitchErrorCode`), never from the sentence.
 */
import { ApiError } from '@/lib/api/client';
import { readSwitchRefusal, switchKeepsRequestId, switchPaths } from '@/lib/pos/switches/api';
import { switchesResponse } from '@/lib/pos/switches/test-fixtures';

const refused = (status: number, body: Record<string, unknown>) => new ApiError(String(body.error ?? 'Refused'), status, body);

describe('the switch routes', () => {
  it('are the contract paths', () => {
    expect(switchPaths).toEqual({
      switches: '/api/venue/feature-switches',
      vouchersCsv: '/api/venue/feature-switches/vouchers.csv',
      dismiss: '/api/venue/prompts/dismiss',
    });
  });
});

describe('readSwitchRefusal', () => {
  it('reads the admin check', () => {
    expect(readSwitchRefusal(refused(403, { error: 'Only admins', code: 'not_admin' }))).toEqual({ kind: 'not_admin' });
    expect(readSwitchRefusal(refused(403, { error: 'Only admins' }))).toEqual({ kind: 'not_admin' });
  });

  it('keeps a billing refusal its own sentence', () => {
    const r = readSwitchRefusal(refused(403, { error: 'Billing is past due.', code: 'VENUE_PAST_DUE' }));
    expect(r.kind).toBe('other');
  });

  it('reads not available with its reason and public reason', () => {
    expect(readSwitchRefusal(refused(409, { error: 'x', code: 'SWITCH_NOT_AVAILABLE', reason: 'blocked', public_reason: 'Paused.' }))).toEqual({
      kind: 'not_available',
      reason: 'blocked',
      publicReason: 'Paused.',
    });
    expect(readSwitchRefusal(refused(409, { error: 'x', code: 'SWITCH_NOT_AVAILABLE', reason: 'made-up' }))).toMatchObject({ reason: null });
  });

  it('reads the blocking sales', () => {
    expect(
      readSwitchRefusal(
        refused(409, {
          error: 'x',
          code: 'SWITCH_IN_USE',
          blocking: [{ kind: 'card_payment_in_progress', sale_id: 's1', sale_number: 12 }, { nonsense: true }],
        }),
      ),
    ).toEqual({ kind: 'in_use', blocking: [{ kind: 'card_payment_in_progress', sale_id: 's1', sale_number: 12 }] });
  });

  it('reads what needs acknowledging', () => {
    expect(readSwitchRefusal(refused(409, { error: 'x', code: 'SWITCH_NEEDS_ACKNOWLEDGEMENT', needs: ['terms', 'other'] }))).toEqual({
      kind: 'needs_ack',
      needs: ['terms'],
    });
  });

  it('carries the fresh state of a stale write', () => {
    const fresh = switchesResponse();
    expect(readSwitchRefusal(refused(412, { error: 'x', code: 'SWITCH_STALE', switches: fresh }))).toEqual({ kind: 'stale', switches: fresh });
  });

  it("says nothing of a server error's words, and reads no answer as the network", () => {
    expect(readSwitchRefusal(refused(500, { error: 'Internal server error' }))).toEqual({ kind: 'other', message: null, status: 500 });
    expect(readSwitchRefusal(new ApiError('Network request failed. Check your connection and try again.', 0))).toEqual({ kind: 'network' });
    expect(readSwitchRefusal(new ApiError('Request timed out.', 408))).toEqual({ kind: 'network' });
    expect(readSwitchRefusal(new Error('boom'))).toEqual({ kind: 'other', message: null, status: null });
  });
});

describe('switchKeepsRequestId', () => {
  it('sends the same request again only when the first answer may have been lost', () => {
    expect(switchKeepsRequestId(new ApiError('Offline', 0))).toBe(true);
    expect(switchKeepsRequestId(new ApiError('Timed out', 408))).toBe(true);
    expect(switchKeepsRequestId(new ApiError('Server', 500))).toBe(true);
    expect(switchKeepsRequestId(new ApiError('Bad gateway', 502))).toBe(false);
    expect(switchKeepsRequestId(refused(409, { error: 'x', code: 'SWITCH_IN_USE' }))).toBe(false);
    expect(switchKeepsRequestId(new Error('not signed in'))).toBe(false);
  });
});
