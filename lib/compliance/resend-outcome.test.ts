import { formLinkResendOutcome } from '@/lib/compliance/resend-outcome';

describe('formLinkResendOutcome', () => {
  it('says the link went out, and by which channel', () => {
    expect(formLinkResendOutcome({ dispatched: true, sent_via: 'sms' }, 'sms')).toEqual({
      sent: true,
      copyUrl: null,
      message: 'Form link resent by SMS.',
    });
  });

  it('says a fresh link went out when the old one had expired', () => {
    expect(formLinkResendOutcome({ dispatched: true, sent_via: 'email', reissued: true }, 'email').message).toBe(
      'Sent a fresh link by email.',
    );
  });

  it('never claims a send that did not happen, and offers the link instead', () => {
    const outcome = formLinkResendOutcome(
      { dispatched: false, sent_via: null, reissued: true, public_url: 'https://example.com/f/abc' },
      'email',
    );
    expect(outcome.sent).toBe(false);
    expect(outcome.copyUrl).toBe('https://example.com/f/abc');
    expect(outcome.message).toBe(
      'Made a fresh link, but could not send it. Check the client has an email address on file. The link is copied, so you can share it another way.',
    );
  });

  it('names a mobile number for SMS, and leaves out the copy line with no link', () => {
    expect(formLinkResendOutcome({ dispatched: false }, 'sms').message).toBe(
      'Could not send the form link. Check the client has a mobile number on file.',
    );
  });
});
