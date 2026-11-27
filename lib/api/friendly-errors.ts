/**
 * The plain-English sentences a person sees when something goes wrong that is
 * not their doing (web codebase standards plan P4.8).
 *
 * Word for word the same as the web's `src/lib/api/friendly-errors.ts`, so the
 * app and the dashboard describe the same failure the same way. Change a
 * sentence in both repos at once.
 *
 * No em-dashes, no status codes, no "server", "JSON" or "network" jargon. The
 * technical detail goes to Sentry (`ApiError.detail`), never on screen.
 */

/** A 5xx from the API, or an answer the app could not read (an HTML page, broken JSON). */
export const FRIENDLY_SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.';

/** The request never reached the API: offline, DNS, a dropped connection. */
export const FRIENDLY_OFFLINE_ERROR = 'You seem to be offline. Check your connection and try again.';

/** The request was sent but no answer came back in time. */
export const FRIENDLY_TIMEOUT_ERROR = 'This is taking longer than it should. Check your connection and try again.';

/** A refusal (4xx) that carried no message of its own. */
export const FRIENDLY_REQUEST_FAILED = 'We could not do that just now. Please try again.';
