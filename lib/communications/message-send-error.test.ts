/**
 * The 502 shape is the one that used to be lost: `{ success:false, errors:[…] }`
 * carries NO `error` key, so the generic message is "Request failed (502)" and
 * the actual reason sits unread in `errors`.
 */
import { ApiError } from '@/lib/api/client';
import { messageSendErrorText, messageSendIssues } from '@/lib/communications/message-send-error';

describe('messageSendIssues', () => {
  it('reads errors[], dropping blanks and non-strings', () => {
    expect(messageSendIssues({ errors: ['Email: Already sent', '', 7, null, 'SMS: Not sent'] })).toEqual([
      'Email: Already sent',
      'SMS: Not sent',
    ]);
  });

  it('is empty for a body that has none', () => {
    expect(messageSendIssues({ error: 'Guest has no email on file' })).toEqual([]);
    expect(messageSendIssues(null)).toEqual([]);
    expect(messageSendIssues('nope')).toEqual([]);
  });
});

describe('messageSendErrorText', () => {
  it('names the per-channel failures on a 502 instead of "Request failed (502)"', () => {
    const error = new ApiError('Request failed (502)', 502, {
      success: false,
      errors: ['Email: Delivery failed (check provider configuration)', 'SMS: Not sent'],
    });
    expect(messageSendErrorText(error)).toBe(
      'Email: Delivery failed (check provider configuration); SMS: Not sent',
    );
  });

  it('uses the API message when the body is a plain { error } (400)', () => {
    const error = new ApiError('Guest has no email on file', 400, {
      error: 'Guest has no email on file',
    });
    expect(messageSendErrorText(error)).toBe('Guest has no email on file');
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(messageSendErrorText(new Error('boom'))).toBe('Could not send the message.');
    expect(messageSendErrorText(undefined, 'Request failed')).toBe('Request failed');
  });
});
