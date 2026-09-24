/**
 * useRestoreSetupChecklist (web QA A-5, 2026-09-23): DELETE
 * /api/venue/setup-checklist-dismiss brings a dismissed checklist back, then the
 * dashboard queries (the setup status and Home) refresh.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { queryKeys } from '@/lib/queries/keys';
import { useRestoreSetupChecklist } from '@/lib/queries/useSetupStatus';

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('useRestoreSetupChecklist', () => {
  it('DELETEs the dismissal and refreshes the dashboard queries', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, dismissed_at: null });
    const client = new QueryClient({
      // gcTime Infinity schedules no garbage-collection timer, so jest can exit.
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    const { result } = await renderHook(() => useRestoreSetupChecklist(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/setup-checklist-dismiss',
      expect.objectContaining({ method: 'DELETE', accessToken: 'token-A' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all() });
  });
});
