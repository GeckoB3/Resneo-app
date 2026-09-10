/**
 * The own-password change goes through `/api/account/password`, the route that
 * updates the user AS THE BEARER CALLER. The staff route
 * (`/api/venue/staff/change-password`) updates through the server's
 * cookie-backed Supabase client, which has no session for an app request, so
 * GoTrue answered "Auth session missing" and the Team page's "Update password"
 * failed for every staff member (2026-09-10).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useChangeOwnPassword } from '@/lib/queries/useTeamMutations';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useChangeOwnPassword', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('posts the new password to the account route as the Bearer caller', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });
    const { result } = await renderHook(() => useChangeOwnPassword(), { wrapper });

    let out: { success: boolean } | undefined;
    await act(async () => {
      out = await result.current.mutateAsync({ new_password: 'correct horse battery' });
    });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/account/password');
    expect(init).toMatchObject({ method: 'POST', accessToken: 'token-A' });
    expect(JSON.parse(init.body as string)).toEqual({ password: 'correct horse battery' });
    expect(out).toEqual({ success: true });
  });
});
