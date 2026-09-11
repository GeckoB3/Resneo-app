/**
 * Messaging several contacts at once, as the web does it.
 *
 * The web's bulk "Message" (`ContactsDashboard.tsx` `runBulkContactMessage`)
 * fans out one `POST /api/venue/guests/{id}/message` per selected contact with
 * `respect_marketing_permission: true`, then counts the replies:
 *   - 200 `{ success: true }`            → sent
 *   - 200 `{ success: false, skipped }`  → deliberately left out (no permission)
 *   - 400 `{ error }` / 502 `{ errors }` → a problem worth naming
 * This module is that classification and its result copy, kept pure so the
 * wording stays pinned by tests; `useBulkGuestMessage` supplies the requests.
 */
import { ApiError } from '@/lib/api/client';
import { messageSendErrorText, messageSendIssues } from '@/lib/communications/message-send-error';

/** Body of `POST /api/venue/guests/[guestId]/message` (success, skip and failure shapes). */
export interface GuestMessageResponse {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  errors?: string[];
}

export interface BulkGuestMessageOutcome {
  guestId: string;
  sent: boolean;
  /** Left out on purpose: no marketing permission. Never counted as a failure. */
  skipped: boolean;
  /** Staff-facing reason this contact was not messaged; null when there is none. */
  issues: string | null;
}

/** In-flight requests on a phone network. The web fans out with no cap. */
export const BULK_GUEST_MESSAGE_CONCURRENCY = 5;

function issueText(body: GuestMessageResponse): string | null {
  const list = messageSendIssues(body);
  if (list.length > 0) return list.join('; ');
  return typeof body.error === 'string' && body.error.trim() !== '' ? body.error : null;
}

/** A 2xx reply: `success` and `skipped` decide, as `res.ok && payload.*` does on the web. */
export function classifyGuestMessageResponse(
  guestId: string,
  payload: unknown,
): BulkGuestMessageOutcome {
  const body = (typeof payload === 'object' && payload !== null ? payload : {}) as GuestMessageResponse;
  return {
    guestId,
    sent: Boolean(body.success),
    skipped: Boolean(body.skipped),
    issues: issueText(body),
  };
}

/** A non-2xx reply, or no reply at all: never sent, never skipped. */
export function classifyGuestMessageFailure(
  guestId: string,
  error: unknown,
): BulkGuestMessageOutcome {
  return {
    guestId,
    sent: false,
    skipped: false,
    // The web shows 'Request failed' when the request never landed.
    issues: error instanceof ApiError ? messageSendErrorText(error, 'Request failed') : 'Request failed',
  };
}

/**
 * Send to every selected contact, at most `concurrency` at a time, and answer
 * one outcome per contact IN SELECTION ORDER. Never rejects: a failed send is
 * an outcome, not a thrown error, so one unreachable contact cannot abandon the
 * rest (the web's per-guest try/catch inside `Promise.all`).
 */
export async function runBulkGuestMessages({
  guestIds,
  send,
  concurrency = BULK_GUEST_MESSAGE_CONCURRENCY,
}: {
  guestIds: readonly string[];
  send: (guestId: string) => Promise<unknown>;
  concurrency?: number;
}): Promise<BulkGuestMessageOutcome[]> {
  const outcomes = new Array<BulkGuestMessageOutcome>(guestIds.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= guestIds.length) return;
      const guestId = guestIds[index];
      try {
        outcomes[index] = classifyGuestMessageResponse(guestId, await send(guestId));
      } catch (error) {
        outcomes[index] = classifyGuestMessageFailure(guestId, error);
      }
    }
  };

  const workers = Math.max(1, Math.min(concurrency, guestIds.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return outcomes;
}

export interface BulkGuestMessageSummary {
  /** Every selected contact was either messaged or deliberately skipped. */
  ok: boolean;
  /** The short line for the toast (web `addToast`). */
  toast: string;
  /** The fuller summary the web puts in its error banner; null when all went out. */
  error: string | null;
}

/**
 * The web's result copy, verbatim (`runBulkContactMessage` ~740-765). Named
 * contacts appear in the failure list; `nameForGuest` answers '' for a contact
 * that is not on screen, and the venue's word for a client stands in.
 */
export function summariseBulkGuestMessage({
  outcomes,
  total,
  clientWord,
  nameForGuest,
}: {
  outcomes: readonly BulkGuestMessageOutcome[];
  total: number;
  clientWord: string;
  nameForGuest: (guestId: string) => string;
}): BulkGuestMessageSummary {
  const clientLower = clientWord.toLowerCase();
  const okCount = outcomes.filter((o) => o.sent).length;
  const skippedCount = outcomes.filter((o) => o.skipped).length;
  const failureSummaries = outcomes
    .filter((o) => !o.sent && !o.skipped && o.issues)
    .slice(0, 5)
    .map((o) => `${nameForGuest(o.guestId) || clientWord}: ${o.issues}`);
  const skippedNote = skippedCount > 0 ? `${skippedCount} skipped (no marketing permission)` : '';

  if (okCount + skippedCount === total && okCount > 0) {
    return {
      ok: true,
      toast: `Message sent to ${okCount} ${clientLower}${okCount === 1 ? '' : 's'}${
        skippedNote ? `, ${skippedNote}` : ''
      }`,
      error: null,
    };
  }

  if (okCount > 0) {
    const preview = failureSummaries.slice(0, 2).join(' · ');
    return {
      ok: false,
      toast: `Sent to ${okCount}/${total}`,
      error: `Sent to ${okCount}/${total}. ${skippedNote ? `${skippedNote}. ` : ''}${preview}`,
    };
  }

  if (skippedCount === total && total > 0) {
    const msg = `No messages sent: none of the selected ${clientLower}s has given marketing permission.`;
    return { ok: false, toast: msg, error: msg };
  }

  const first = failureSummaries[0] ?? 'No messages were sent.';
  return { ok: false, toast: first, error: skippedNote ? `${first} ${skippedNote}.` : first };
}
