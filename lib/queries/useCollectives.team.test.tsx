/**
 * F-2 (web 2026-09-23): only the catalogue GET carries the live page's `team`.
 * A catalogue PATCH seeds the cache from its response, which has no team, so
 * the seed must keep the team the GET brought or "Meet the team" would fall
 * back to the member calendars until the refetch landed.
 */
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { queryKeys } from '@/lib/queries/keys';
import { useCatalogueAction } from '@/lib/queries/useCollectives';
import type { CatalogueManagementView, CatalogueResponse } from '@/types/collectives';

function view(items: CatalogueManagementView['items'] = []): CatalogueManagementView {
  return { collectiveId: 'col-1', pageMode: 'unified_catalog', items, memberSources: [] };
}

it('keeps the live team when a catalogue PATCH seeds the cache', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  const key = queryKeys.collectives.catalogue('token-A', 'col-1');
  const team = [{ id: 'p-1', name: 'Andrew' }];
  client.setQueryData<CatalogueResponse>(key, { catalogue: view(), importSources: ['s'], team });

  const updated: CatalogueManagementView = { ...view(), pageMode: 'directory' };
  mockApiFetch.mockResolvedValueOnce({ catalogue: updated });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const { result, unmount } = await renderHook(() => useCatalogueAction(), { wrapper: Wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      collectiveId: 'col-1',
      payload: { action: 'archive_item', itemId: 'item-1' } as never,
    });
  });

  const cached = client.getQueryData<CatalogueResponse>(key);
  expect(cached?.catalogue).toEqual(updated);
  expect(cached?.importSources).toEqual(['s']);
  expect(cached?.team).toEqual(team);
  await unmount();
  client.clear();
});
