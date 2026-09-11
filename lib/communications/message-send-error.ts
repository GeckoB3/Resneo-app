/**
 * What to show when a custom message fails to send.
 *
 * The message routes answer a failure in two shapes: a 400 carries `{ error }`
 * ("Guest has no email on file"), and a 502 — nothing went out — carries
 * `{ success: false, errors: [...] }` with NO `error` key. Reading only the
 * generic message on the second one shows "Request failed (502)" and loses the
 * one line that says why, so every composer reads `errors[]` first, exactly as
 * the web does (`ContactDetailPanel.tsx` ~745-752, `BookingDetailContent.tsx`
 * ~1015-1022: `payload.errors.join('; ') ?? payload.error`).
 */
import { ApiError } from '@/lib/api/client';

/**
 * The per-channel failures an error (or a 200 partial-send payload) carries.
 * Empty when the body has none.
 */
export function messageSendIssues(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const { errors } = body as { errors?: unknown };
  if (!Array.isArray(errors)) return [];
  return errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

/**
 * The most specific text for a failed send: the per-channel failures when the
 * body lists them, otherwise the API error message (which already resolves
 * `{ error }` bodies), otherwise `fallback`.
 */
export function messageSendErrorText(
  error: unknown,
  fallback = 'Could not send the message.',
): string {
  if (error instanceof ApiError) {
    const issues = messageSendIssues(error.body);
    if (issues.length > 0) return issues.join('; ');
    return error.message;
  }
  return fallback;
}
