/**
 * Communications-15 (Medium): the in-app notification feed must poll so the feed
 * and the More-tab unread badge stay current without user action, matching the
 * web bell's 60s `setInterval` (`NotificationBell.tsx` `POLL_MS = 60_000`).
 *
 * This asserts the polling options are present on the `useNotifications` query:
 * `refetchInterval: 60_000` and `refetchIntervalInBackground: false`. It mounts a
 * tiny probe component that calls the hook inside a real QueryClientProvider,
 * then reads the registered query's options straight off the QueryCache — a
 * stable contract test independent of react-query's internal timer behaviour.
 *
 * `apiFetch` resolves synchronously and the tree is unmounted + the cache
 * cleared inside `act`, so the background refetch + poll timer are torn down
 * before the test ends (no open handles, no act warnings).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => ({
  apiFetch: jest.fn(() => Promise.resolve({ notifications: [], unreadCount: 0 })),
  ApiError: class ApiError extends Error {},
}));

import { useNotifications } from '@/lib/queries/useNotifications';

function Probe() {
  useNotifications();
  return null;
}

describe('useNotifications — polling options', () => {
  it('polls every 60s and not while backgrounded (web parity)', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });

    const queries = client.getQueryCache().findAll();
    expect(queries.length).toBeGreaterThan(0);

    // The notifications query carries the polling options (web parity poll).
    const opts = queries[0].options as {
      refetchInterval?: unknown;
      refetchIntervalInBackground?: unknown;
    };
    expect(opts.refetchInterval).toBe(60_000);
    expect(opts.refetchIntervalInBackground).toBe(false);

    // Tear down inside act so the pending refetch + poll timer settle/cancel
    // before the test ends (no open handles, no "update not wrapped in act").
    await act(async () => {
      cleanup();
      client.getQueryCache().clear();
      client.clear();
    });
  });
});
