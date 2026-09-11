import { bookingModificationNotifyOutcome } from '@/lib/booking/modification-notify-result';

/**
 * The notify route answers 200 whether or not it sent anything, so the toast
 * has to read the body (web `formatBookingModificationNotifyToast`).
 */
describe('bookingModificationNotifyOutcome', () => {
  it('names the channels that went out', () => {
    expect(bookingModificationNotifyOutcome({ emailSent: true, smsSent: true })).toEqual({
      sent: true,
      message: 'Update sent by email and SMS.',
    });
    expect(bookingModificationNotifyOutcome({ emailSent: true })).toEqual({
      sent: true,
      message: 'Update sent by email.',
    });
    expect(bookingModificationNotifyOutcome({ smsSent: true })).toEqual({
      sent: true,
      message: 'Update sent by SMS.',
    });
  });

  it('passes the server reason through when the send was skipped', () => {
    expect(
      bookingModificationNotifyOutcome({ skipped: true, skippedReason: 'Guest has no email or phone on file' }),
    ).toEqual({ sent: false, message: 'Guest has no email or phone on file' });
  });

  it('explains a skip with no reason, and a 200 that sent nothing', () => {
    expect(bookingModificationNotifyOutcome({ skipped: true })).toEqual({
      sent: false,
      message: 'Guest was not notified (reschedule notifications are off).',
    });
    expect(bookingModificationNotifyOutcome({})).toEqual({
      sent: false,
      message: 'Guest has no email or phone on file, so the update was not sent.',
    });
  });
});
