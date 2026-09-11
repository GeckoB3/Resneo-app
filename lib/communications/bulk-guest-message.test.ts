/**
 * The bulk send's bookkeeping and its result copy, which is the web's verbatim
 * (`ContactsDashboard.tsx` `runBulkContactMessage`): a contact with no marketing
 * permission is SKIPPED, never a failure, and only a real problem is named.
 */
import { ApiError } from '@/lib/api/client';
import {
  classifyGuestMessageFailure,
  classifyGuestMessageResponse,
  runBulkGuestMessages,
  summariseBulkGuestMessage,
  type BulkGuestMessageOutcome,
} from '@/lib/communications/bulk-guest-message';

const sent = (guestId: string): BulkGuestMessageOutcome => ({
  guestId,
  sent: true,
  skipped: false,
  issues: null,
});
const skipped = (guestId: string): BulkGuestMessageOutcome => ({
  guestId,
  sent: false,
  skipped: true,
  issues: null,
});
const failed = (guestId: string, issues: string): BulkGuestMessageOutcome => ({
  guestId,
  sent: false,
  skipped: false,
  issues,
});

describe('classifyGuestMessageResponse', () => {
  it('counts a 200 { success: true } as sent', () => {
    expect(classifyGuestMessageResponse('g1', { success: true, errors: [] })).toEqual(sent('g1'));
  });

  it('counts the route’s 200 skip as skipped, not as a failure', () => {
    expect(
      classifyGuestMessageResponse('g1', {
        success: false,
        skipped: true,
        reason: 'Opted out of marketing',
      }),
    ).toEqual({ guestId: 'g1', sent: false, skipped: true, issues: null });
  });

  it('keeps the issue text of a partial send that still went out', () => {
    expect(
      classifyGuestMessageResponse('g1', { success: true, errors: ['SMS: Guest has no phone on file'] }),
    ).toEqual({ guestId: 'g1', sent: true, skipped: false, issues: 'SMS: Guest has no phone on file' });
  });
});

describe('classifyGuestMessageFailure', () => {
  it('reads a 400 { error }', () => {
    const error = new ApiError('Guest has no email on file', 400, {
      error: 'Guest has no email on file',
    });
    expect(classifyGuestMessageFailure('g1', error)).toEqual(
      failed('g1', 'Guest has no email on file'),
    );
  });

  it('reads a 502 errors[]', () => {
    const error = new ApiError('Request failed (502)', 502, {
      success: false,
      errors: ['Email: Delivery failed (check provider configuration)'],
    });
    expect(classifyGuestMessageFailure('g1', error)).toEqual(
      failed('g1', 'Email: Delivery failed (check provider configuration)'),
    );
  });

  it('says "Request failed" when the request never landed', () => {
    expect(classifyGuestMessageFailure('g1', new Error('offline'))).toEqual(
      failed('g1', 'Request failed'),
    );
  });
});

describe('runBulkGuestMessages', () => {
  it('sends once per contact, answers in selection order, and caps what is in flight', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const calls: string[] = [];
    let inFlight = 0;
    let peak = 0;

    const outcomes = await runBulkGuestMessages({
      guestIds: ids,
      concurrency: 2,
      send: async (guestId) => {
        calls.push(guestId);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return { success: true };
      },
    });

    expect(calls.sort()).toEqual(ids);
    expect(peak).toBeLessThanOrEqual(2);
    expect(outcomes.map((o) => o.guestId)).toEqual(ids);
    expect(outcomes.every((o) => o.sent)).toBe(true);
  });

  it('does not abandon the rest when one contact cannot be reached', async () => {
    const outcomes = await runBulkGuestMessages({
      guestIds: ['a', 'b', 'c'],
      send: async (guestId) => {
        if (guestId === 'b') throw new Error('offline');
        return { success: true };
      },
    });

    expect(outcomes).toEqual([sent('a'), failed('b', 'Request failed'), sent('c')]);
  });
});

describe('summariseBulkGuestMessage', () => {
  const nameForGuest = (guestId: string) => (guestId === 'g2' ? 'Bob Vance' : '');

  it('reports a clean send, counting the skipped separately', () => {
    expect(
      summariseBulkGuestMessage({
        outcomes: [sent('g1'), sent('g2'), skipped('g3')],
        total: 3,
        clientWord: 'Client',
        nameForGuest,
      }),
    ).toEqual({
      ok: true,
      toast: 'Message sent to 2 clients, 1 skipped (no marketing permission)',
      error: null,
    });
  });

  it('says nothing about skips when there were none, and singularises one client', () => {
    expect(
      summariseBulkGuestMessage({
        outcomes: [sent('g1')],
        total: 1,
        clientWord: 'Guest',
        nameForGuest,
      }).toast,
    ).toBe('Message sent to 1 guest');
  });

  it('names the contacts behind a partial send', () => {
    expect(
      summariseBulkGuestMessage({
        outcomes: [sent('g1'), failed('g2', 'Guest has no email on file'), skipped('g3')],
        total: 3,
        clientWord: 'Client',
        nameForGuest,
      }),
    ).toEqual({
      ok: false,
      toast: 'Sent to 1/3',
      error:
        'Sent to 1/3. 1 skipped (no marketing permission). Bob Vance: Guest has no email on file',
    });
  });

  it('explains a send where every contact lacked permission', () => {
    const msg = 'No messages sent: none of the selected clients has given marketing permission.';
    expect(
      summariseBulkGuestMessage({
        outcomes: [skipped('g1'), skipped('g2')],
        total: 2,
        clientWord: 'Client',
        nameForGuest,
      }),
    ).toEqual({ ok: false, toast: msg, error: msg });
  });

  it('leads with the first failure when nothing went out, and falls back to the client word', () => {
    expect(
      summariseBulkGuestMessage({
        outcomes: [failed('g1', 'Guest has no email on file'), skipped('g3')],
        total: 2,
        clientWord: 'Client',
        nameForGuest,
      }),
    ).toEqual({
      ok: false,
      toast: 'Client: Guest has no email on file',
      error: 'Client: Guest has no email on file 1 skipped (no marketing permission).',
    });
  });

  it('has something to say even when no outcome carried a reason', () => {
    expect(
      summariseBulkGuestMessage({
        outcomes: [{ guestId: 'g1', sent: false, skipped: false, issues: null }],
        total: 1,
        clientWord: 'Client',
        nameForGuest,
      }).toast,
    ).toBe('No messages were sent.');
  });
});
