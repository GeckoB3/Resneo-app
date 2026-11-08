import { cancelNoticeLine, laneCancellationPolicy } from '@/lib/booking/cancel-notice-line';

/** Web QA 2026-11-08 BKG-B-F13 in the app: the cancel prompt promised a message nobody sent. */
describe('cancelNoticeLine', () => {
  const on = { enabled: true, channels: ['email' as const] };

  it('says the messages are off, so staff tell the client themselves', () => {
    expect(cancelNoticeLine({ policy: { enabled: false, channels: ['email'] }, guestEmail: 'a@b.c', guestPhone: null })).toBe(
      'Cancellation messages are switched off, so tell them yourself.',
    );
  });

  it('says how it will be sent when it will be', () => {
    expect(cancelNoticeLine({ policy: on, guestEmail: 'a@b.c', guestPhone: null })).toBe(
      'We will email them what is cancelled and what stays.',
    );
    expect(
      cancelNoticeLine({ policy: { enabled: true, channels: ['email', 'sms'] }, guestEmail: 'a@b.c', guestPhone: '07700900123' }),
    ).toBe('We will email and text them what is cancelled and what stays.');
  });

  it('says there is nowhere to send it', () => {
    expect(cancelNoticeLine({ policy: on, guestEmail: null, guestPhone: '07700900123' })).toBe(
      'We have no email or mobile number to send the cancellation to, so tell them yourself.',
    );
  });

  it('promises nothing when the setting is not known (loading, or a partner business)', () => {
    expect(cancelNoticeLine({ policy: null, guestEmail: 'a@b.c', guestPhone: null })).toBe(
      'Make sure they know what is cancelled and what stays.',
    );
  });

  it('does not guess at contact details this person cannot see', () => {
    expect(cancelNoticeLine({ policy: on, guestEmail: null, guestPhone: null, contactsHidden: true })).toBe(
      'If we have their email or mobile number, we will tell them what is cancelled and what stays.',
    );
  });

  it('reads the lane setting, and nothing for a lane it does not have', () => {
    expect(
      laneCancellationPolicy({ appointments_other: { cancellation_confirmation: { enabled: false, channels: ['sms'] } } }, 'appointments_other'),
    ).toEqual({ enabled: false, channels: ['sms'] });
    expect(laneCancellationPolicy({}, 'appointments_other')).toBeNull();
    expect(laneCancellationPolicy(undefined, 'table')).toBeNull();
  });
});
