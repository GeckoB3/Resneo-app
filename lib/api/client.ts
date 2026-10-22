import { getApiUrl } from '@/lib/env';
import {
  chosenSitePending,
  getChosenSiteId,
  getSiteEpoch,
  markSiteLost,
  setChosenSite,
  siteHeaders,
} from '@/lib/sites/active-site';

/** Common error shape from reserve-ni /api routes. */
export interface ApiErrorBody {
  error: string;
  /** Machine-readable code, e.g. VENUE_PAST_DUE from billing middleware. */
  code?: string;
  details?: unknown;
  fallback?: boolean;
  /**
   * Set on a 409 from booking-impact endpoints (opening-hours / practitioners
   * PATCH) when narrowing hours would orphan existing bookings. The caller
   * re-runs the request with `acknowledge: true` to proceed knowingly.
   */
  requires_confirmation?: boolean;
  /** Human-readable summary of the affected bookings (shown in the armed-confirm UI). */
  message?: string;
  /** How many upcoming bookings fall outside the new hours. */
  affected_count?: number;
  /** A small sample of the affected bookings for the confirm copy. */
  affected_bookings?: unknown;
}

export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ApiErrorBody).error === 'string'
  );
}

/** The 409 booking-impact body — `{ requires_confirmation, message?, … }` with no `error` key. */
export interface RequiresConfirmationBody {
  requires_confirmation: true;
  message?: string;
  affected_count?: number;
  affected_bookings?: unknown;
}

/**
 * Narrow an `ApiError.body` to the 409 "requires confirmation" shape. The
 * orphan-check 409 carries `requires_confirmation: true` (and no `error` field),
 * so `isApiErrorBody` does NOT match it — use this guard instead.
 */
export function isRequiresConfirmationBody(
  body: unknown,
): body is RequiresConfirmationBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { requires_confirmation?: unknown }).requires_confirmation === true
  );
}

/**
 * Pull the first specific field message out of a zod `error.flatten()` body.
 *
 * The API answers a failed schema parse with a bare `{ error: 'Invalid request',
 * details: { formErrors, fieldErrors } }`. Surfacing only `error` told the user
 * nothing about WHICH field was wrong — a service whose price was blank failed
 * every save with "Invalid request" no matter what had been edited, and the only
 * way to find out why was to read the route's schema. The details are already on
 * the wire; this just says what they say.
 *
 * Returns null when the body carries no usable field detail.
 */
export function zodDetailMessage(details: unknown): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const { formErrors, fieldErrors } = details as {
    formErrors?: unknown;
    fieldErrors?: unknown;
  };

  if (typeof fieldErrors === 'object' && fieldErrors !== null) {
    for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
      const first = Array.isArray(messages)
        ? messages.find((m): m is string => typeof m === 'string' && m.trim() !== '')
        : null;
      // Field names are snake_case wire names; "buffer minutes" reads better
      // than "buffer_minutes" in a sentence shown to a salon owner.
      if (first) return `${field.replace(/_/g, ' ')}: ${first}`;
    }
  }

  if (Array.isArray(formErrors)) {
    const first = formErrors.find((m): m is string => typeof m === 'string' && m.trim() !== '');
    if (first) return first;
  }
  return null;
}

export function getApiErrorMessage(body: unknown, status: number): string {
  if (isApiErrorBody(body)) {
    if (body.code === 'VENUE_PAST_DUE') {
      return 'Billing is past due. Update payment on the web dashboard to edit bookings.';
    }
    if (body.code === 'VENUE_SUBSCRIPTION_EXPIRED') {
      return 'Subscription ended. Resubscribe on the web dashboard to edit bookings.';
    }
    if (status === 403) {
      return body.error;
    }
    // A 400 from a schema parse: name the offending field rather than making
    // the user guess from "Invalid request".
    const detail = status === 400 ? zodDetailMessage(body.details) : null;
    return detail ? `${body.error} (${detail})` : body.error;
  }
  if (status === 403) {
    return 'You do not have permission for this action.';
  }
  return `Request failed (${status})`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: ApiErrorBody | unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Extract the friendly "compliance requirement unmet" message from a 409 (the
 * booking create/edit compliance gate), or null when it's a different error. The
 * server sends `{ error: 'COMPLIANCE_REQUIREMENT_UNMET', message, details }`, so
 * without this the generic handler would surface the raw error code.
 */
export function complianceBlockMessage(error: unknown): string | null {
  if (
    error instanceof ApiError &&
    error.status === 409 &&
    isApiErrorBody(error.body) &&
    error.body.error === 'COMPLIANCE_REQUIREMENT_UNMET'
  ) {
    return error.body.message ?? 'A compliance requirement is unmet for this booking.';
  }
  return null;
}

/**
 * True for the 409 web's C3 fix added: the slot was still free when the request
 * was validated and had gone by the time it reached the insert.
 *
 * Every appointment write now re-checks immediately before writing, so this is a
 * routine outcome rather than an exceptional one — two staff booking the same
 * 10:00 within a second of each other. It matters to the caller because the
 * cached availability that offered the slot is now known to be wrong: the
 * message alone would leave the picker still showing it, and the obvious next
 * move is to tap it again.
 *
 * Matched on `code`, not on the sentence — copy changes, contracts do not.
 *
 * @see Docs/APP_GAP_REPORT_R16_WEB_DELTA.md (R16-3)
 */
export function isSlotTakenError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    isApiErrorBody(error.body) &&
    error.body.code === 'SLOT_NO_LONGER_AVAILABLE'
  );
}

/**
 * A write refused because what it was based on changed underneath it (412 `STALE_RESOURCE`).
 * Since web W2/W12, `PUT /api/venue/practitioner-services` without `expected_service_ids` answers
 * this when the whole set would drop a service another venue gave the calendar in the last day.
 * The caller refetches and asks the person to look again.
 */
export function isStaleResource(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 412 &&
    isApiErrorBody(error.body) &&
    error.body.code === 'STALE_RESOURCE'
  );
}

/** The `code` of an API refusal, when it carries one. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isApiErrorBody(error.body)) return null;
  return typeof error.body.code === 'string' ? error.body.code : null;
}

/**
 * The code on an answer `apiFetch` dropped because the person switched site while it was on its way
 * (web roles plan §6.2c). Not the server's: nothing was wrong with the request, it just belongs to
 * the site the phone has left, so nobody should see it or store it.
 */
export const SITE_SWITCHED_CODE = 'SITE_SWITCHED';

/** True for an answer dropped because the site changed while it was on its way. */
export function isSiteSwitchedError(error: unknown): boolean {
  return apiErrorCode(error) === SITE_SWITCHED_CODE;
}

const SITE_SWITCHED_MESSAGE = 'You switched site, so this was not shown. Please try again.';

function siteSwitchedError(): ApiError {
  return new ApiError(SITE_SWITCHED_MESSAGE, 0, { error: SITE_SWITCHED_MESSAGE, code: SITE_SWITCHED_CODE });
}

/** The absolute URL of an API path, e.g. `/api/venue/export?…`. */
export function apiUrl(path: string): string {
  return `${getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Add the chosen site's header (`X-ResNeo-Venue`) to the headers of a request to the API that does
 * not go through `apiFetch`: a file downloaded straight to disk, say. A URL anywhere else (a signed
 * storage URL) is left alone, so the site is never sent to another host.
 */
export function withApiSiteHeader(url: string, headers: Record<string, string> = {}): Record<string, string> {
  let base = '';
  try {
    base = getApiUrl();
  } catch {
    return headers;
  }
  if (!base || !url.startsWith(base)) return headers;
  return { ...headers, ...siteHeaders() };
}

type RawFetchInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

/**
 * `fetch` for the few requests to the API that need the raw response rather than parsed JSON:
 * multipart uploads, CSV text, the Ask ResNeo stream (pass `expo/fetch` as `fetchImpl`). It adds the
 * chosen site's header, as `apiFetch` does; the caller keeps its own Authorization, timeout and
 * error handling. A guard test (`lib/api/raw-fetch-guard.test.ts`) keeps every other raw fetch to
 * the API out of the app.
 */
export async function apiRawFetch<R = Response>(
  path: string,
  init: RawFetchInit = {},
  fetchImpl?: (url: string, init: RawFetchInit) => Promise<R>,
): Promise<R> {
  const pending = chosenSitePending();
  if (pending) await pending;
  const url = apiUrl(path);
  const request: RawFetchInit = { ...init, headers: { ...(init.headers ?? {}), ...siteHeaders() } };
  if (fetchImpl) return fetchImpl(url, request);
  return fetch(url, request as RequestInit) as unknown as Promise<R>;
}

type ApiFetchOptions = RequestInit & {
  accessToken?: string | null;
  /**
   * Abort the request after this many ms (default 15s). Without it a stalled
   * fetch never rejects, so any `loading={mutation.isPending}` button spins
   * until the OS socket times out (can be 60s+).
   */
  timeoutMs?: number;
};

/** Default request timeout — see ApiFetchOptions.timeoutMs. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Optional hook that yields a *fresh* access token after a 401, letting apiFetch
 * transparently refresh and retry the request once. Registered by AuthProvider
 * (it owns the Supabase session); kept as an injected dependency so this module
 * stays auth-agnostic and unit tests that never register it keep the original
 * single-attempt behaviour.
 *
 * Contract: return the NEW token, or `null` when a different token could not be
 * obtained. `null` means "do NOT retry": either the session is gone, or the
 * token is still valid and the 401 is a genuine permission failure — e.g. the
 * staff gate's "valid session but not venue staff" 401, which must surface so
 * the gate can redirect to /staff-required rather than loop.
 */
export type AccessTokenRefresher = (expiredToken: string) => Promise<string | null>;

let accessTokenRefresher: AccessTokenRefresher | null = null;

/** Register (or clear, with `null`) the 401 → refresh-and-retry-once hook. */
export function setAccessTokenRefresher(refresher: AccessTokenRefresher | null): void {
  accessTokenRefresher = refresher;
}

/**
 * Ask the registered refresher for a fresh token, exactly as `apiFetch` does on
 * a 401: a null answer, the same token back, or a throw all mean "this 401 is
 * not an expiry, do not retry".
 *
 * Exported for the one caller that cannot go through `apiFetch` — the Ask
 * ResNeo stream reads a `text/event-stream` body itself, so it owns its own
 * refresh-and-retry-once rather than inheriting this one.
 */
export async function refreshExpiredAccessToken(expiredToken: string): Promise<string | null> {
  if (!accessTokenRefresher) return null;
  try {
    const refreshed = await accessTokenRefresher(expiredToken);
    return refreshed && refreshed !== expiredToken ? refreshed : null;
  } catch {
    return null;
  }
}

/**
 * Called when the server has told us our credentials are dead and refreshing
 * them did not help.
 *
 * There is no way back from this inside a request: the caller can only fail.
 * The session has to end, and that decision belongs to the auth layer rather
 * than here, so this is a hook rather than a `signOut()` call.
 */
export type AuthenticationLostHandler = () => void;

let authenticationLostHandler: AuthenticationLostHandler | null = null;

/** Register (or clear, with `null`) the dead-credentials hook. */
export function setAuthenticationLostHandler(handler: AuthenticationLostHandler | null): void {
  authenticationLostHandler = handler;
}

/**
 * Whether a 401 means "your session is dead" rather than "you may not do this".
 *
 * **The difference is load-bearing and the codes are what carry it.** The
 * account routes answer an unauthenticated caller with `UNAUTHENTICATED`.
 * `GET /api/venue/staff/me` answers a perfectly valid customer session with a
 * bare 401 and no code, because "you are not staff at any venue" is how this
 * app IDENTIFIES a customer: `useRole` reads exactly that 401 and returns
 * `customer`.
 *
 * So treating every 401 as a lost session would sign out every customer in the
 * app the moment they opened it. Requiring the code is what keeps the two
 * apart, and it is why this is a narrow test rather than `status === 401`.
 */
function isAuthenticationLost(err: ApiError): boolean {
  // Both halves. The status alone catches the staff gate's "not staff"; the
  // code alone would end the session on any status that happened to carry it,
  // including a 500. Only a 401 is the server rejecting our credentials.
  if (err.status !== 401) return false;
  const body = err.body;
  return isApiErrorBody(body) && body.code === 'UNAUTHENTICATED';
}

function parseApiResponseBody(text: string, url: string): unknown {
  if (!text) {
    return null;
  }

  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) {
    throw new ApiError(
      `Expected JSON from ${url} but received HTML. Check EXPO_PUBLIC_API_URL, Vercel Deployment Protection (disable for staging), or a login redirect.`,
      502,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      `Invalid JSON from ${url}. Response started with: ${trimmed.slice(0, 80)}`,
      502,
    );
  }
}

/**
 * Fetch wrapper for ReserveNI /api routes.
 * Phase 1 will pass the Supabase access token as Bearer auth.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const {
    accessToken,
    headers,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    ...init
  } = options;
  const url = apiUrl(path);

  // The chosen site is read from SecureStore at launch; a request that beats
  // that read waits for it, so it never goes out naming no site (the home site)
  // when another was chosen. Only ever pending for the first moments of a run.
  const sitePending = chosenSitePending();
  if (sitePending) await sitePending;

  /** The site the latest attempt named in `X-ResNeo-Venue`, or null for none. */
  // (Cast, not annotated: it is written inside `attempt`, which narrowing cannot see.)
  let sentSite = null as string | null;

  // A single network attempt with the given Bearer token. Each attempt gets its
  // own AbortController/timeout so a retry (below) is independently time-boxed.
  const attempt = async (bearer: string | null | undefined): Promise<T> => {
    // Read per attempt: the 403 retry below goes out after the choice is cleared.
    const site = siteHeaders();
    sentSite = getChosenSiteId();
    const startedEpoch = getSiteEpoch();
    // Time-box the request so a stalled network rejects (retryable) instead of
    // hanging the UI. Also forward any caller-provided signal (e.g. React Query
    // cancellation) so both can abort the same fetch.
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else if (typeof callerSignal.addEventListener === 'function') {
        callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          // Let the platform set the multipart boundary for FormData uploads
          // (collective page-asset uploads); only force JSON for plain bodies.
          ...(init.body && !(init.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          // Which site this acts on (web roles plan §6.2c). Absent when none is
          // chosen, so the server answers for the home site, as for an old build.
          ...site,
          ...headers,
        },
      });

      const text = await response.text();
      /*
        The person switched site while this was on its way. Its answer is about
        the site they have left: drop it rather than let a caller show it, or
        write it into the cache under the new site's keys.
      */
      if (getSiteEpoch() !== startedEpoch) {
        throw siteSwitchedError();
      }
      const data = parseApiResponseBody(text, url);

      if (!response.ok) {
        throw new ApiError(
          getApiErrorMessage(data, response.status),
          response.status,
          data,
        );
      }

      return data as T;
    } catch (err) {
      // Preserve our own structured errors (4xx/5xx, HTML-instead-of-JSON, etc.).
      if (err instanceof ApiError) {
        throw err;
      }
      if (timedOut) {
        throw new ApiError('Request timed out. Check your connection and try again.', 408);
      }
      // Genuine caller cancellation — re-throw so React Query treats it as a
      // cancellation rather than a failure.
      if (callerSignal?.aborted) {
        throw err;
      }
      throw new ApiError('Network request failed. Check your connection and try again.', 0);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    return await attempt(accessToken);
  } catch (err) {
    /*
      403 SITE_NOT_AVAILABLE: the chosen site is one this login no longer
      belongs to (it was removed, or the site closed). `staff/me` and
      `me/sites` say so. Go back to the home site, letting go of everything tied
      to the old one, and ask once more without the header.
    */
    if (
      err instanceof ApiError &&
      err.status === 403 &&
      apiErrorCode(err) === 'SITE_NOT_AVAILABLE' &&
      sentSite !== null
    ) {
      if (getChosenSiteId() === sentSite) {
        markSiteLost();
        await setChosenSite(null);
      }
      if (getChosenSiteId() === null) {
        return await attempt(accessToken);
      }
      throw err;
    }
    // Transparently recover from an expired Bearer token — typically the first
    // request after the app resumes from the background, before Supabase's
    // auto-refresh has propagated the new token into the query layer. We retry
    // ONCE, and only when all of these hold:
    //   - it's a 401 (not a network/timeout/permission error),
    //   - we actually sent a token (anonymous 401s aren't an expiry),
    //   - a refresher is registered, and
    //   - it returns a *different* token (a refresh actually happened).
    // A refresher returning the same token / null means the 401 is a genuine
    // permission failure (e.g. not venue staff) — rethrow so callers and the
    // staff gate handle it exactly as before. Retrying a 401 is safe even for
    // mutations: the server rejected the request pre-handler, so nothing ran.
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      accessToken &&
      accessTokenRefresher
    ) {
      let refreshed: string | null = null;
      try {
        refreshed = await accessTokenRefresher(accessToken);
      } catch {
        refreshed = null;
      }
      if (refreshed && refreshed !== accessToken) {
        /*
          The retry is checked too, and it has to be checked HERE. Returning it
          bare would let its rejection leave this catch block without passing
          the test below, so a session that refreshed cleanly and was then
          rejected again, which is exactly what a revoked session does, would go
          unnoticed. Found by the test rather than by reading.
        */
        try {
          return await attempt(refreshed);
        } catch (retryErr) {
          if (retryErr instanceof ApiError && isAuthenticationLost(retryErr)) {
            authenticationLostHandler?.();
          }
          throw retryErr;
        }
      }
    }
    /*
      A 401 that says UNAUTHENTICATED and survived the refresh above means the
      credentials are dead rather than stale, and nothing the app does will fix
      them. Say so, once, so the session can end and the person is sent to sign
      in again.

      Without this the app sits on a revoked session indefinitely. A session
      revoked server-side, by signing out everywhere or by requesting account
      deletion, leaves a JWT here that is not yet EXPIRED, so Supabase keeps
      returning it from storage, never attempts a refresh, and never emits
      SIGNED_OUT. Every request 401s and every screen shows its own error, which
      is what "Could not load your account" was: not a connection problem, a
      dead session with nobody to declare it.
    */
    if (err instanceof ApiError && accessToken && isAuthenticationLost(err)) {
      authenticationLostHandler?.();
    }
    throw err;
  }
}
