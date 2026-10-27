/**
 * Curating the page from every venue's services (owner, 2026-10-27): the requests, and how a server
 * without the route, a refused request and a lost connection each come back.
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

import {
  useCurateServices,
  useDeclineSuggestions,
  useSuggestServices,
  useVenueServices,
} from '@/lib/queries/useCollectiveCurate';

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

describe('useVenueServices', () => {
  it("reads every venue's services", async () => {
    mockHandler = () => ({
      role: 'host',
      collective_name: 'Northside',
      host_venue_id: 'v-host',
      venues: [{ venue_id: 'v-host', venue_name: 'Host', is_host: true, services: [] }],
    });
    const { result } = await renderHook(() => useVenueServices('col-1', true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockCalls[0]).toEqual({ path: '/api/venue/collectives/col-1/venue-services', method: 'GET', body: undefined });
    expect(result.current.data).toEqual({
      role: 'host',
      collective_name: 'Northside',
      host_venue_id: 'v-host',
      host_name: null,
      venues: [{ venue_id: 'v-host', venue_name: 'Host', is_host: true, services: [] }],
    });
  });

  it('answers null on a server without the route, so the screens keep what they did', async () => {
    mockHandler = () => {
      throw new ApiError('Request failed (404)', 404);
    };
    const { result } = await renderHook(() => useVenueServices('col-1', true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('fails on anything else, and asks nothing while switched off', async () => {
    mockHandler = () => {
      throw new ApiError('Could not load the services. Please try again.', 500, { error: 'x' });
    };
    const { result } = await renderHook(() => useVenueServices('col-1', true), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    mockCalls.length = 0;
    await renderHook(() => useVenueServices('col-1', false), { wrapper: Wrapper });
    expect(mockCalls).toHaveLength(0);
  });
});

describe('useCurateServices', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ venue_id: 'v-zen', service_id: `s${i}` }));

  it('sends 200 at a time with the action and mode, and gathers one result per service', async () => {
    mockHandler = (call) => ({
      results: (call.body as { items: { venue_id: string; service_id: string }[] }).items.map((i) => ({ ...i, ok: true })),
    });
    const { result } = await renderHook(() => useCurateServices('col-1'), { wrapper: Wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ action: 'add', mode: 'separate', items: items(250) });
    });
    expect(mockCalls.map((c) => [c.path, c.method, (c.body as { items: unknown[] }).items.length])).toEqual([
      ['/api/venue/collectives/col-1/venue-services', 'POST', 200],
      ['/api/venue/collectives/col-1/venue-services', 'POST', 50],
    ]);
    expect(mockCalls[0]?.body).toMatchObject({ action: 'add', mode: 'separate' });
    expect(outcome?.results).toHaveLength(250);
    expect(outcome?.refused).toBe(false);
  });

  it("reports a refused request's services as not done, with the route's words", async () => {
    mockHandler = () => {
      throw new ApiError('Only the host can do that.', 403, { error: 'Only the host can do that.' });
    };
    const { result } = await renderHook(() => useCurateServices('col-1'), { wrapper: Wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ action: 'remove', items: items(2) });
    });
    expect(mockCalls[0]?.body).toMatchObject({ action: 'remove', mode: 'match' });
    expect(outcome).toEqual({
      refused: true,
      refusal: 'Only the host can do that.',
      results: [
        { venue_id: 'v-zen', service_id: 's0', ok: false, message: 'Only the host can do that.' },
        { venue_id: 'v-zen', service_id: 's1', ok: false, message: 'Only the host can do that.' },
      ],
    });
  });

  it('throws when the request never reached the route', async () => {
    mockHandler = () => {
      throw new ApiError('Network request failed', 0);
    };
    const { result } = await renderHook(() => useCurateServices('col-1'), { wrapper: Wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ action: 'add', items: items(1) })).rejects.toBeInstanceOf(ApiError);
    });
  });
});

describe('suggesting and leaving suggestions off, many at once', () => {
  it("sends a member's services as one suggestion", async () => {
    mockHandler = () => ({ ok: true, suggested: 2, already_suggested: false, already_count: 0, host_name: 'Host' });
    const { result } = await renderHook(() => useSuggestServices(), { wrapper: Wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ collectiveId: 'col-1', serviceIds: ['a', 'b'] });
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/collectives/col-1/suggestions',
      method: 'POST',
      body: { service_ids: ['a', 'b'] },
    });
    expect(outcome).toEqual({ ok: true, suggested: 2, already_suggested: false, already_count: 0, host_name: 'Host' });
  });

  it("sends the host's Not now for many suggestions", async () => {
    mockHandler = () => ({ ok: true, already: false, declined: 2 });
    const { result } = await renderHook(() => useDeclineSuggestions(), { wrapper: Wrapper });
    let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({ collectiveId: 'col-1', serviceIds: ['a', 'b'] });
    });
    expect(mockCalls[0]).toEqual({
      path: '/api/venue/collectives/col-1/suggestions/decline',
      method: 'POST',
      body: { service_ids: ['a', 'b'] },
    });
    expect(outcome).toEqual({ already: false, declined: 2 });
  });
});
