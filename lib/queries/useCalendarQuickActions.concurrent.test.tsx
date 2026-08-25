/**
 * The calendar's quick-action mutations are ONE shared instance serving every
 * bar on the grid, and the bar's spinner is driven by a hand-maintained set of
 * booking ids that each handler must clear when its own call settles.
 *
 * That makes the clearing path load-bearing, and it is why the handlers in
 * `app/(app)/(tabs)/index.tsx` await `mutateAsync` in a `try/finally` rather
 * than passing `onSuccess`/`onError` to `mutate()`. Those per-call callbacks are
 * bound to the mutation OBSERVER, and React Query's `MutationObserver.mutate()`
 * detaches the observer from the in-flight mutation before starting the next
 * one — so a second call silently drops the first call's callbacks. The request
 * still runs and the hook-level `onSuccess` still invalidates, which is why the
 * device symptom was a bar that changed colour and status correctly but kept a
 * spinner where its buttons belong, forever.
 *
 * Two overlapping calls is the normal case, not a corner one: CalendarDayGrid's
 * `handleBarStatusChange` fans a single tray press out across every segment of a
 * merged visit or party bar, synchronously.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({
  isBackendConfigured: () => true,
  getApiUrl: () => 'https://api.test',
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useCalendarStatusAction } from '@/lib/queries/useCalendarQuickActions';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

/**
 * The shape of the real handler: add the id, await the shared mutation, clear
 * the id in a `finally` whatever happened.
 */
function runAction(
  mutateAsync: (input: { bookingId: string; status: 'Completed' }) => Promise<unknown>,
  pending: Set<string>,
  bookingId: string,
) {
  pending.add(bookingId);
  return (async () => {
    try {
      await mutateAsync({ bookingId, status: 'Completed' });
    } catch {
      // The handler toasts here; the test only cares that `finally` still runs.
    } finally {
      pending.delete(bookingId);
    }
  })();
}

it('clears every fanned-out segment id, not just the last press', async () => {
  mockApiFetch.mockResolvedValue({ ok: true });
  const { result } = await renderHook(() => useCalendarStatusAction(), {
    wrapper: makeWrapper(),
  });

  const pending = new Set<string>();
  const segmentIds = ['seg-1', 'seg-2', 'seg-3'];

  // One tray press on a three-service visit bar: three synchronous calls into
  // the one shared mutation instance.
  await Promise.all(segmentIds.map((id) => runAction(result.current.mutateAsync, pending, id)));

  expect(mockApiFetch).toHaveBeenCalledTimes(3);
  // Was ["seg-1", "seg-2"] before the fix — a bar stuck showing a spinner.
  expect([...pending]).toEqual([]);
});

it('clears the id when a fanned-out call fails', async () => {
  mockApiFetch.mockRejectedValue(new Error('409'));
  const { result } = await renderHook(() => useCalendarStatusAction(), {
    wrapper: makeWrapper(),
  });

  const pending = new Set<string>();
  await Promise.all(
    ['seg-1', 'seg-2'].map((id) => runAction(result.current.mutateAsync, pending, id)),
  );

  await waitFor(() => expect([...pending]).toEqual([]));
});
