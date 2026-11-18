/**
 * Manage collective, Settings reads and saves (card-on-file plan §21.5, §21.3 item 6).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({});
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    try {
      return Promise.resolve(mockHandler(call));
    } catch (e) {
      return Promise.reject(e);
    }
  },
}));

import { isStaleCollectiveSave, useCollectiveSettings, useSaveCollectiveRule } from '@/lib/queries/useCollectiveSettings';

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => client.clear());

describe('useCollectiveSettings', () => {
  it('reads the section', async () => {
    mockHandler = () => ({ can_edit: true });
    const { result } = await renderHook(() => useCollectiveSettings('col-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCalls[0].path).toBe('/api/venue/collectives/col-1/settings');
    expect(result.current.data).toEqual({ can_edit: true });
  });

  it('reads a server without the section as null, not an error', async () => {
    mockHandler = () => {
      throw new ApiError('Not found', 404, '<html>');
    };
    const { result } = await renderHook(() => useCollectiveSettings('col-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('keeps a real refusal an error', async () => {
    mockHandler = () => {
      throw new ApiError('Collective not found', 404, { error: 'Collective not found' });
    };
    const { result } = await renderHook(() => useCollectiveSettings('col-1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useSaveCollectiveRule', () => {
  it('names the version on each route and reads the settings again', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveCollectiveRule('col-1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ route: 'feature-flags', patch: { waitlist_v2: false }, version: 4 });
      await result.current.mutateAsync({ route: 'venue', patch: { require_account_login_for_bookings: true }, version: 4 });
    });
    expect(mockCalls).toEqual([
      { path: '/api/venue/feature-flags', method: 'PATCH', body: { waitlist_v2: false, booking_settings_version: 4 } },
      { path: '/api/venue', method: 'PATCH', body: { require_account_login_for_bookings: true, booking_settings_version: 4 } },
    ]);
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(keys.some((k) => k.includes('"settings"') && k.includes('"col-1"'))).toBe(true);
  });

  it('tells a stale save from other refusals', () => {
    expect(isStaleCollectiveSave(new ApiError('x', 412, { error: 'x', code: 'COLLECTIVE_SETTINGS_CHANGED' }))).toBe(true);
    expect(isStaleCollectiveSave(new ApiError('x', 412, { error: 'x' }))).toBe(false);
    expect(isStaleCollectiveSave(new Error('x'))).toBe(false);
  });
});
