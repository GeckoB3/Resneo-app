/**
 * Sending a receipt or a pay link from the till for someone whose "Can see client phone numbers and
 * emails" is off (web roles plan A2, §5.6). The sale's client has their phone and email as null, so
 * the field starts empty: leaving it empty sends to what is saved for the client (the server's `to`
 * is optional), and typing sends to that instead. The answer's `destination` is null for them too,
 * so the "sent" line never repeats a hidden value.
 */

export type SendChannel = 'sms' | 'email';

/** The line under the empty field when the sale has a client. */
export function savedContactHelper(channel: SendChannel): string {
  return channel === 'sms'
    ? 'Leave this empty to send it to the mobile number saved for them.'
    : 'Leave this empty to send it to the email address saved for them.';
}

/** Where it went, for the "sent" line: the server's answer, what was typed, or the saved details. */
export function sentToWords(destination: string | null | undefined, typed: string, channel: SendChannel): string {
  const said = typeof destination === 'string' ? destination.trim() : '';
  if (said) return said;
  if (typed.trim()) return typed.trim();
  return channel === 'sms' ? 'their saved mobile number' : 'their saved email address';
}
