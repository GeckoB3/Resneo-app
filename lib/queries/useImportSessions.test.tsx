/**
 * Clients-05 (Medium): useImportSessions / useUndoImportSession + isAuthGap.
 *
 * Covers:
 *  - isAuthGap: true ONLY for ApiError 401/403; false for other ApiErrors,
 *    plain Errors, and non-errors (drives the venue-profile read-only fallback);
 *  - useImportSessions: GETs `/api/import/sessions` with the Bearer token and
 *    returns the `{ sessions }` payload; an auth-gap (401) is NOT retried;
 *  - useUndoImportSession: POSTs `/api/import/sessions/[id]/undo` (id encoded).
 *
 * `apiFetch` is stubbed; the real ApiError + isAuthGap stay (pure). jest hoists
 * mock factories, so closed-over vars are `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

import { ApiError } from '@/lib/api/client';
import {
  isAuthGap,
  useImportSessions,
  useUndoImportSession,
} from '@/lib/queries/useImportSessions';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('isAuthGap', () => {
  it('is true for ApiError 401 and 403 (cookie-only backend, not reachable via Bearer)', () => {
    expect(isAuthGap(new ApiError('Unauthorised', 401))).toBe(true);
    expect(isAuthGap(new ApiError('Forbidden', 403))).toBe(true);
  });

  it('is false for other ApiError statuses, plain Errors, and non-errors', () => {
    expect(isAuthGap(new ApiError('Server error', 500))).toBe(false);
    expect(isAuthGap(new ApiError('Bad request', 400))).toBe(false);
    expect(isAuthGap(new Error('boom'))).toBe(false);
    expect(isAuthGap(null)).toBe(false);
    expect(isAuthGap({ status: 401 })).toBe(false);
  });
});

describe('useImportSessions', () => {
  it('GETs /api/import/sessions with the Bearer token and returns sessions', async () => {
    mockApiFetch.mockResolvedValueOnce({ sessions: [{ id: 's1', status: 'complete' }] });

    const { result } = await renderHook(() => useImportSessions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/api/import/sessions');
    expect((opts as { accessToken?: string }).accessToken).toBe(mockToken);
    expect(result.current.data?.sessions).toHaveLength(1);
  });

  it('does not retry the deterministic auth gap (401)', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Unauthorised', 401, { error: 'Unauthorised' }));

    const { result } = await renderHook(() => useImportSessions(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The hook's retry predicate must short-circuit 401 → exactly one attempt.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(isAuthGap(result.current.error)).toBe(true);
  });
});

describe('useUndoImportSession', () => {
  it('POSTs the undo route with the session id URL-encoded', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    const { result } = await renderHook(() => useUndoImportSession(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync('sess 1');
    });

    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/api/import/sessions/sess%201/undo');
    expect((opts as { method?: string }).method).toBe('POST');
    expect((opts as { accessToken?: string }).accessToken).toBe(mockToken);
  });
});
