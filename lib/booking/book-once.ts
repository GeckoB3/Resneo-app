import { useState } from 'react';

import { ApiError, apiErrorCode } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';

/**
 * Book once (web codebase standards plan P2.7).
 *
 * The create hooks send a `client_request_id` (a UUID) with every create: one per Book press. A
 * retry of the same press (the same payload after an answer that may have been lost) sends the same
 * key, and a server that books once replays the booking it made, with `replayed: true`, rather than
 * making a second one. A server before P2.7 ignores the field, so the app behaves as before.
 *
 * Answers about the key:
 * - 409 `CREATE_IN_PROGRESS`: the first try is still being made. Wait a moment and send it again,
 *   with the same key.
 * - 409 `REQUEST_REUSED`: the key was used for something else. Nothing was made; the server's
 *   sentence is shown and the next press has a new key.
 */

/** The first try is still being made on the server: send the same request again shortly. */
export function isCreateInProgress(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && apiErrorCode(error) === 'CREATE_IN_PROGRESS';
}

/** The key was used for a different request: nothing was made. */
export function isBookRequestReused(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && apiErrorCode(error) === 'REQUEST_REUSED';
}

/**
 * Whether a failed create keeps its key for the next try (the till's rule, `keepsRequestId` in
 * `lib/pos/api.ts`, plus a timeout): no answer (network, status 0), a timeout (408), a server error
 * other than 502, or "still being made". The booking may exist, so the next try is the same press.
 * Any other refusal made nothing, so the next try is a new press.
 */
export function keepsBookRequestId(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 0 || error.status === 408) return true;
  if (isCreateInProgress(error)) return true;
  return error.status >= 500 && error.status !== 502;
}

/** One key per Book press, for a create hook. */
export interface BookPressKey {
  /**
   * Send `payload` with a `client_request_id`: the open press's key when the payload is the same,
   * else a new one. A clear answer ends the press; a lost one keeps it open for the retry.
   */
  send<P extends object, T>(payload: P, call: (body: P & { client_request_id: string }) => Promise<T>): Promise<T>;
}

export function createBookPressKey(mintKey: () => string = newPaymentAttemptId): BookPressKey {
  let open: { signature: string; key: string } | null = null;
  return {
    async send(payload, call) {
      const { client_request_id: _ignored, ...rest } = payload as Record<string, unknown>;
      const signature = JSON.stringify(rest);
      const key = open && open.signature === signature ? open.key : mintKey();
      open = { signature, key };
      try {
        const result = await call({ ...(rest as typeof payload), client_request_id: key });
        open = null;
        return result;
      } catch (error) {
        if (!keepsBookRequestId(error)) open = null;
        throw error;
      }
    },
  };
}

/** One {@link BookPressKey} for the life of a hook's component. */
export function useBookPressKey(): BookPressKey {
  const [press] = useState(createBookPressKey);
  return press;
}

/** `server_features.book_once` from `GET /api/venue/staff/me`: absent on an older server. */
export function serverBooksOnce(staffMe: { server_features?: { book_once?: boolean } | null } | null | undefined): boolean {
  return staffMe?.server_features?.book_once === true;
}

let latestServerFeatures: { book_once?: boolean } | null = null;

/** Called with each `GET /api/venue/staff/me` answer (`useStaffMe`), which the app loads at start. */
export function rememberServerFeatures(staffMe: { server_features?: { book_once?: boolean } | null } | null | undefined): void {
  latestServerFeatures = staffMe?.server_features ?? null;
}

/** Whether the server last said it books once. False until staff/me has answered, and on an older server. */
export function serverBooksOnceNow(): boolean {
  return serverBooksOnce({ server_features: latestServerFeatures });
}

/** How many times a timed-out create is sent again, with the same key, before falling back to looking for it. */
export const BOOK_ONCE_MAX_RESENDS = 5;
/** The pause before each resend: the first try may still be finishing. */
export const BOOK_ONCE_RESEND_DELAY_MS = 3000;
