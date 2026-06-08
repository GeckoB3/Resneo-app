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
};

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
  const { accessToken, headers, ...init } = options;
  const url = `${getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
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
}
