/**
 * Why the last connection-token fetch failed, in the server's words.
 *
 * The Terminal SDK calls our `tokenProvider` itself (inside `initialize()`, and again whenever it
 * needs a fresh token) and, when that throws, reports only its own sentence: "Couldn't fetch
 * connection token. Please check your tokenProvider method". That reached staff as the reason a
 * card payment on a linked calendar would not start, when the server had said exactly why (the
 * other business had not turned on in-person payments, say). `fetchConnectionToken` records the
 * server's sentence here and `terminalErrorMessage` shows it in place of the SDK's.
 *
 * Kept apart from connection-token.ts so the SDK wrapper can read it without importing the API
 * client.
 */

let lastFailure: string | null = null;

/** Record (or, with null, clear) the reason the last token fetch failed. */
export function setConnectionTokenFailure(message: string | null): void {
  lastFailure = message && message.trim() ? message : null;
}

/** The reason the last token fetch failed, or null when it succeeded or none has run. */
export function getConnectionTokenFailure(): string | null {
  return lastFailure;
}
