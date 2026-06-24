/**
 * Mock-mutation test for the account-deletion hook. Pins the request contract
 * against the web `/api/account/delete-request` route — the in-app path that
 * satisfies Apple Guideline 5.1.1(v).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useRequestAccountDeletion } from '@/lib/queries/useAccountDeletion';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

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
