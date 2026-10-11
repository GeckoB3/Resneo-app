/**
 * Setting up Checkout over Bearer (POS Part 4): the status read only at a POS venue, a team
 * member's or an older server's refusal read as an answer (no retry), progress saved at the version
 * read and sent once more at the fresh version a stale answer (412 `SETUP_STALE`) carries, "Hide"
 * kept on the server with the card gone at once, and the phones read every five seconds only while
 * a screen waits for one.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import { isSetupRefusal, staleSetupStatus } from '@/lib/pos/setup/api';
import { queryKeys } from '@/lib/queries/keys';
import {
  setupKeys,
  useCollectPhones,
  useHideSetupCard,
  usePosSetupStatus,
  useSaveSetupProgress,
} from '@/lib/queries/usePosSetup';
import type { PosSetupStatus } from '@/types/pos-setup';

const mockApiFetch = jest.fn();
let mockPosOn = true;

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  isBackendConfigured: () => true,
}));
jest.mock('@/lib/queries/useVenue', () => ({
  useVenue: () => ({ data: { feature_flags: { raw: {}, resolved: { pos_enabled: mockPosOn } } } }),
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function status(over: Partial<PosSetupStatus> = {}): PosSetupStatus {
  return {
    started_at: null,
    finished_at: null,
    steps: [{ id: 'tips', applies: true, state: 'todo' }],
    done: 0,
    total: 1,
    answers: {},
    next_screen: 'welcome',
    phones: { ready: [], needs_update: [] },
    card_hidden: false,
    show_card: true,
    version: 1,
    ...over,
  };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mockApiFetch.mockReset();
  mockPosOn = true;
});

afterEach(() => {
  client.clear();
});

describe('usePosSetupStatus', () => {
  it('reads the status over Bearer with the POS headers', async () => {
    mockApiFetch.mockResolvedValue(status());
    const { result } = await renderHook(() => usePosSetupStatus(), { wrapper });
    await waitFor(() => expect(result.current.data?.version).toBe(1));
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/pos/setup-status');
    expect(init).toEqual(expect.objectContaining({ accessToken: 'token-A', method: 'GET' }));
    expect(Object.keys(init.headers)).toEqual(expect.arrayContaining(['X-ResNeo-Client']));
  });

  it('asks nothing at a venue without Checkout', async () => {
    mockPosOn = false;
    await renderHook(() => usePosSetupStatus(), { wrapper });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("reads a team member's or an older server's refusal as an answer", () => {
    expect(isSetupRefusal(new ApiError('No', 403))).toBe(true);
    expect(isSetupRefusal(new ApiError('Not found', 404))).toBe(true);
    expect(isSetupRefusal(new ApiError('Oops', 500))).toBe(false);
  });
});

describe('useSaveSetupProgress', () => {
  it('saves at the version read and keeps the fresh status', async () => {
    client.setQueryData(setupKeys.status('token-A'), status({ version: 4 }));
    const fresh = status({ version: 5, answers: { tips: 'yes' } });
    mockApiFetch.mockResolvedValue(fresh);
    const { result } = await renderHook(() => useSaveSetupProgress(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      outcome = await result.current({ answers: { tips: 'yes' } });
    });
    expect(outcome).toEqual({ ok: true, status: fresh });
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/pos/setup-progress');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ answers: { tips: 'yes' }, version: 4 });
    expect(client.getQueryData(setupKeys.status('token-A'))).toEqual(fresh);
  });

  it('sends once more at the fresh version a stale answer carries', async () => {
    client.setQueryData(setupKeys.status('token-A'), status({ version: 4 }));
    const theirs = status({ version: 9 });
    const after = status({ version: 10, steps: [{ id: 'tips', applies: true, state: 'skipped' }] });
    mockApiFetch
      .mockRejectedValueOnce(new ApiError('Changed', 412, { error: 'Changed', code: 'SETUP_STALE', status: theirs }))
      .mockResolvedValueOnce(after);
    const { result } = await renderHook(() => useSaveSetupProgress(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      outcome = await result.current({ step: { id: 'tips', state: 'skipped' } });
    });
    expect(outcome).toEqual({ ok: true, status: after });
    expect(JSON.parse(mockApiFetch.mock.calls[1]![1].body)).toEqual({ step: { id: 'tips', state: 'skipped' }, version: 9 });
  });

  it("answers the server's sentence when it refuses, and never throws", async () => {
    client.setQueryData(setupKeys.status('token-A'), status());
    mockApiFetch.mockRejectedValue(new ApiError('Only an admin can do this.', 403, { error: 'Only an admin can do this.' }));
    const { result } = await renderHook(() => useSaveSetupProgress(), { wrapper });
    let outcome: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      outcome = await result.current({ started: true });
    });
    expect(outcome).toEqual({ ok: false, message: 'Only an admin can do this.' });
  });

  it('finds the fresh status in a stale answer wherever the body puts it', () => {
    const fresh = status({ version: 3 });
    expect(staleSetupStatus(new ApiError('x', 412, { status: fresh }))).toEqual(fresh);
    expect(staleSetupStatus(new ApiError('x', 412, { ...fresh, error: 'x' }))).toEqual(expect.objectContaining({ version: 3 }));
    expect(staleSetupStatus(new ApiError('x', 412, { error: 'x' }))).toBeNull();
    expect(staleSetupStatus(new ApiError('x', 409, { status: fresh }))).toBeNull();
  });
});

describe('useHideSetupCard', () => {
  it('keeps "Hide" on the server and takes the card away at once', async () => {
    client.setQueryData(setupKeys.status('token-A'), status());
    mockApiFetch.mockResolvedValue({ ok: true, dismissed: ['pos_setup'] });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useHideSetupCard(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/venue/prompts/dismiss',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ key: 'pos_setup' }) }),
    );
    expect(client.getQueryData<PosSetupStatus>(setupKeys.status('token-A'))).toEqual(
      expect.objectContaining({ show_card: false, card_hidden: true }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.venue.all() });
  });
});

describe('useCollectPhones', () => {
  it('reads the phones every five seconds only while polling, and stops once what it waited for came', async () => {
    jest.useFakeTimers();
    try {
      mockApiFetch.mockResolvedValue({ can_take_cards: true, phones: [] });
      const { rerender, unmount } = await renderHook(
        ({ poll, done }: { poll: boolean; done: boolean }) => useCollectPhones({ poll, until: () => done }),
        { wrapper, initialProps: { poll: true, done: false } },
      );
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      await rerender({ poll: true, done: true });
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(mockApiFetch.mock.calls.length).toBeLessThanOrEqual(3);
      expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/venue/pos/collect-phones');
      await unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
