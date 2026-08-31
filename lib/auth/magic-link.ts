import { ApiError, apiFetch, isApiErrorBody } from '@/lib/api/client';

/**
 * Ask ResNeo to send its own branded sign-in email.
 *
 * **Why this exists rather than `supabase.auth.signInWithOtp`.** Calling
 * Supabase directly sends Supabase's default template, from
 * `noreply@mail.app.supabase.io`, whose link points at GoTrue's verify endpoint
 * and comes back to a `resneo://` redirect. That redirect is the fragile part:
 * it depends on the custom scheme being on the project's allowlist, and on the
 * mail client and browser being willing to hand a custom scheme off from an
 * HTTP 302. Plenty are not, and when it fails it fails silently, landing on the
 * website instead of the app with nothing logged anywhere.
 *
 * `POST /api/auth/send-magic-link` is the route the web signs in through. It is
 * public, it sends from `bookings@resneo.com`, and it puts a six-digit code in
 * the email for exactly this caller: the route's own comment says a native
 * client "CAN call `verifyOtp` directly against Supabase with this code, which
 * means the app needs no ResNeo route to sign in at all". The email says
 * "Using the ResNeo app? Enter this code instead". The app simply never asked.
 *
 * Typing six digits removes the whole class of failure above. There is no
 * redirect, no custom scheme, no allowlist and no email client in the path.
 */
export type MagicLinkOutcome =
  /** The branded email is on its way and carries a code to type. */
  | { status: 'sent' }
  /**
   * The server declined to send it and asked us to use Supabase instead. Not an
   * error: the route answers this when SendGrid is unconfigured or link
   * generation failed, precisely so the caller still has a way in.
   */
  | { status: 'fallback' }
  | { status: 'error'; message: string };

/**
 * Send the branded email.
 *
 * Unauthenticated by design: this is how somebody with no session gets one.
 */
export async function sendBrandedMagicLink(email: string): Promise<MagicLinkOutcome> {
  try {
    const body = await apiFetch<{ ok?: boolean; fallback?: boolean }>(
      '/api/auth/send-magic-link',
      { method: 'POST', body: JSON.stringify({ email }) },
    );
    // `{ fallback: true }` is a 200. Treating it as success would show "check
    // your email" for a message that was never sent.
    return body?.fallback ? { status: 'fallback' } : { status: 'sent' };
  } catch (err) {
    /*
      A 429 is the one refusal worth repeating word for word. The route rate
      limits per address as well as per IP, specifically to protect somebody
      whose inbox is being bombed, and "try again shortly" is information the
      person needs rather than a failure to hide.
    */
    if (err instanceof ApiError && err.status === 429) {
      const detail = isApiErrorBody(err.body) ? err.body.error : null;
      return { status: 'error', message: detail ?? 'Too many attempts. Try again shortly.' };
    }
    /*
      Anything else falls back rather than failing. A customer trying to sign in
      does not care which of two mail systems carries the message, and refusing
      to sign them in because OUR nicer email failed would be choosing branding
      over access.
    */
    return { status: 'fallback' };
  }
}

/** Whether a typed code looks like the six digits the email contains. */
export function isLikelySignInCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

/** Digits only, capped at six, so pasting "123 456" or a whole sentence still works. */
export function normaliseSignInCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}
