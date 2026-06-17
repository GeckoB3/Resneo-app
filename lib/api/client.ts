import { getApiUrl } from '@/lib/env';

/** Common error shape from reserve-ni /api routes. */
export interface ApiErrorBody {
  error: string;
  /** Machine-readable code, e.g. VENUE_PAST_DUE from billing middleware. */
  code?: string;
  details?: unknown;
  fallback?: boolean;
}

export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ApiErrorBody).error === 'string'
  );
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
    return body.error;
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
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
}
