/**
 * What to say after sending the deferred "your booking changed" notice.
 *
 * Port of web `src/lib/booking/modification-notify-result.ts`
 * (`formatBookingModificationNotifyToast`). `POST
 * /api/venue/bookings/[id]/guest-modification-notify` answers 200 even when it
 * sent nothing — modification notifications switched off, no channel enabled,
 * or the guest has no email and no phone — and says which in `skipped` /
 * `skippedReason`. Reporting "notified" on any 200 told staff the guest knew
 * about a change they had never been told about.
 */
export interface BookingModificationNotifyResult {
  emailSent?: boolean;
  smsSent?: boolean;
  skipped?: boolean;
  skippedReason?: string;
}

/** The sentence to show, and whether anything actually went out. */
export function bookingModificationNotifyOutcome(result: BookingModificationNotifyResult): {
  sent: boolean;
  message: string;
} {
  if (result.skipped) {
    return {
      sent: false,
      message: result.skippedReason ?? 'Guest was not notified (reschedule notifications are off).',
    };
  }
  if (result.emailSent && result.smsSent) {
    return { sent: true, message: 'Update sent by email and SMS.' };
  }
  if (result.emailSent) return { sent: true, message: 'Update sent by email.' };
  if (result.smsSent) return { sent: true, message: 'Update sent by SMS.' };
  return { sent: false, message: 'Guest has no email or phone on file, so the update was not sent.' };
}
