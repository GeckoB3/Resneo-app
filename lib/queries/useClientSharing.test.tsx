/**
 * Clients to check, the requests (web plan §1A.2 step 6): answering one card, "Link all likely
 * matches" and "Keep all separate" (2026-11-15), and which of two records a person elsewhere is.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockHandler: (call: Call) => unknown = () => ({ ok: true });
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (path: string, options: { method?: string; body?: string } = {}) => {
    const call = { path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : undefined };
    mockCalls.push(call);
    return Promise.resolve(mockHandler(call));
  },
}));

import { useDecideClientCard, useJoinAllLikely, useKeepAllSeparate } from '@/lib/queries/useClientSharing';

let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockCalls.length = 0;
  mockHandler = () => ({ ok: true });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => client.clear());

describe('useDecideClientCard', () => {
  it('sends a plain answer without a guest id', async () => {
    const { result } = await renderHook(() => useDecideClientCard('c1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cardId: 'card-1', decision: 'same_person' });
    });
    expect(mockCalls).toEqual([
      {
        path: '/api/venue/collectives/c1/client-sharing/check/card-1',
        method: 'POST',
        body: { decision: 'same_person' },
      },
    ]);
  });

  it('sends which of the two records is that person with link_to', async () => {
    const { result } = await renderHook(() => useDecideClientCard('c1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cardId: 'card-9', decision: 'link_to', guestId: 'g-2' });
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/collectives/c1/client-sharing/check/card-9',
      method: 'POST',
      body: { decision: 'link_to', guest_id: 'g-2' },
    });
  });

  it('sends keep_separate with no guest id', async () => {
    const { result } = await renderHook(() => useDecideClientCard('c1'), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ cardId: 'card-9', decision: 'keep_separate', guestId: 'g-2' });
    });
    expect(mockCalls[0]?.body).toEqual({ decision: 'keep_separate' });
  });
});

describe('the whole-list answers', () => {
  it('links all likely matches', async () => {
    mockHandler = () => ({ ok: true, batch_id: 'b1', joined: 3 });
    const { result } = await renderHook(() => useJoinAllLikely('c1'), { wrapper: Wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync();
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/collectives/c1/client-sharing/check',
      method: 'POST',
      body: { action: 'join_all_likely' },
    });
    expect(res).toEqual({ ok: true, batch_id: 'b1', joined: 3 });
  });

  it('keeps all likely matches separate and says how many', async () => {
    mockHandler = () => ({ ok: true, kept: 200 });
    const { result } = await renderHook(() => useKeepAllSeparate('c1'), { wrapper: Wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.mutateAsync();
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/collectives/c1/client-sharing/check',
      method: 'POST',
      body: { action: 'keep_all_separate' },
    });
    expect(res).toEqual({ ok: true, kept: 200 });
  });
});
