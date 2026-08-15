import { getApiUrl } from '@/lib/env';

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
    return detail ? `${body.error} — ${detail}` : body.error;
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
  const url = `${getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  // A single network attempt with the given Bearer token. Each attempt gets its
  // own AbortController/timeout so a retry (below) is independently time-boxed.
  const attempt = async (bearer: string | null | undefined): Promise<T> => {
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
          ...headers,
        },
      });

      const text = await response.text();
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
        return attempt(refreshed);
      }
    }
    throw err;
  }
}
