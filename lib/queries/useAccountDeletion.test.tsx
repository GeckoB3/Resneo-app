/**
 * Mock-mutation tests for the account-deletion hooks. Pins the request/cancel
 * contracts against the web `/api/account/delete-request` routes — the in-app
 * path that satisfies Apple Guideline 5.1.1(v) — and the status read against
 * `user_profiles.deleted_at` (owner-readable under RLS
 * `user_profiles_select_own`; there is no status route on the web).
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
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// Supabase client used by the status read (session id + own-profile select).
type MaybeSingleResult = {
  data: { deleted_at: string | null } | null;
  error: { message: string } | null;
};
const mockMaybeSingle = jest.fn(
  (): Promise<MaybeSingleResult> => Promise.resolve({ data: { deleted_at: null }, error: null }),
);
const mockGetSession = jest.fn(() =>
  Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
);
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: () => mockGetSession() },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            mockFromArgs({ table, columns, column, value });
            return mockMaybeSingle();
          },
        }),
      }),
    }),
  }),
}));
const mockFromArgs = jest.fn();

import {
  useAccountDeletionStatus,
  useCancelAccountDeletion,
  useRequestAccountDeletion,
} from '@/lib/queries/useAccountDeletion';

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
  mockFromArgs.mockReset();
  mockMaybeSingle.mockClear();
  mockGetSession.mockClear();
});

describe('useRequestAccountDeletion', () => {
  it('POSTs /api/account/delete-request with the bearer token and no body', async () => {
    mockApiFetch.mockResolvedValueOnce({ deletion_scheduled_at: '2026-07-24T00:00:00.000Z' });
    const { result } = await renderHook(() => useRequestAccountDeletion(), {
      wrapper: makeWrapper(),
    });

    let res: { deletion_scheduled_at: string | null } | undefined;
    await act(async () => {
      res = await result.current.mutateAsync();
    });

    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/account/delete-request');
    expect((opts as { method: string }).method).toBe('POST');
    expect((opts as { accessToken: string }).accessToken).toBe(mockToken);
    // No request body — the server derives the user from the bearer token.
    expect((opts as { body?: string }).body).toBeUndefined();
    expect(res?.deletion_scheduled_at).toBe('2026-07-24T00:00:00.000Z');
  });
});

describe('useCancelAccountDeletion', () => {
  it('POSTs /api/account/delete-request/cancel with the bearer token', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });
    const { result } = await renderHook(() => useCancelAccountDeletion(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/account/delete-request/cancel');
    expect((opts as { method: string }).method).toBe('POST');
    expect((opts as { accessToken: string }).accessToken).toBe(mockToken);
  });
});

describe('useAccountDeletionStatus', () => {
  it('reads the signed-in user’s own user_profiles.deleted_at', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { deleted_at: '2026-09-07T00:00:00.000Z' },
      error: null,
    });
    const { result } = await renderHook(() => useAccountDeletionStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.deletion_scheduled_at).toBe('2026-09-07T00:00:00.000Z');
    expect(mockFromArgs).toHaveBeenCalledWith({
      table: 'user_profiles',
      columns: 'deleted_at',
      column: 'id',
      value: 'user-1',
    });
  });

  it('maps a missing row (no profile) to null — no pending deletion', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { result } = await renderHook(() => useAccountDeletionStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.deletion_scheduled_at).toBeNull();
  });
});
