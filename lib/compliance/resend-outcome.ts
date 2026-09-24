/**
 * What to tell staff after a form link resend (`POST
 * /api/venue/compliance/form-links/[id]/resend`).
 *
 * The route answers 200 whether or not anything went out: `dispatched` says if
 * the email or SMS was sent. The app used to say "Form link resent" (or "Sent a
 * fresh link") either way, so a client with no email on file looked contacted
 * when nobody was. The web says it could not send and points to Copy link; here
 * the link is copied for staff, as the web's Compliance page does.
 */
export interface FormLinkResendResult {
  dispatched: boolean;
  sent_via?: 'email' | 'sms' | null;
  reissued?: boolean;
  public_url?: string;
}

export interface FormLinkResendOutcome {
  /** True when the email or SMS went out. */
  sent: boolean;
  /** The link to copy for staff when nothing was sent. */
  copyUrl: string | null;
  message: string;
}

export function formLinkResendOutcome(
  result: FormLinkResendResult | null | undefined,
  sendVia: 'email' | 'sms',
): FormLinkResendOutcome {
  const channel = (result?.sent_via ?? sendVia) === 'sms' ? 'SMS' : 'email';
  if (result?.dispatched) {
    return {
      sent: true,
      copyUrl: null,
      message: result.reissued ? `Sent a fresh link by ${channel}.` : `Form link resent by ${channel}.`,
    };
  }
  const missing = sendVia === 'sms' ? 'a mobile number' : 'an email address';
  const copyUrl = result?.public_url ?? null;
  const lead = result?.reissued ? 'Made a fresh link, but could not send it' : 'Could not send the form link';
  return {
    sent: false,
    copyUrl,
    message: `${lead}. Check the client has ${missing} on file.${
      copyUrl ? ' The link is copied, so you can share it another way.' : ''
    }`,
  };
}
