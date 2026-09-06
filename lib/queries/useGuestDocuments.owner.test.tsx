/**
 * A partner's guest's Records are read under the partner's venue: every
 * documents route is asked with `owner_venue_id`, and our own guests' routes
 * carry no scope at all.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockApiFetch = jest.fn();
jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
jest.mock('expo-file-system/legacy', () => ({}), { virtual: true });

import { fetchDocumentDownloadUrl, useGuestDocuments } from '@/lib/queries/useGuestDocuments';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

function calledPath(): URL {
  const [path] = mockApiFetch.mock.calls[0] as [string];
  return new URL(path, 'https://api.test');
}

describe('guest documents under an owner venue', () => {
  it('lists our own guest with no scope', async () => {
    mockApiFetch.mockResolvedValue({ documents: [] });
    const { result } = await renderHook(() => useGuestDocuments('g1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = calledPath();
    expect(url.pathname).toBe('/api/venue/guests/g1/documents');
    expect(url.searchParams.has('owner_venue_id')).toBe(false);
  });

  it("lists a partner's guest under the partner venue", async () => {
    mockApiFetch.mockResolvedValue({ documents: [] });
    const { result } = await renderHook(
      () => useGuestDocuments('g1', { ownerVenueId: 'venue-9' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = calledPath();
    expect(url.pathname).toBe('/api/venue/guests/g1/documents');
    expect(url.searchParams.get('owner_venue_id')).toBe('venue-9');
  });

  it('keeps the view intent beside the scope on a download link', async () => {
    mockApiFetch.mockResolvedValue({ url: 'https://files.test/x' });
    await expect(
      fetchDocumentDownloadUrl('token-A', 'g1', 'd1', 'view', { ownerVenueId: 'venue-9' }),
    ).resolves.toBe('https://files.test/x');
    const url = calledPath();
    expect(url.pathname).toBe('/api/venue/guests/g1/documents/d1/download');
    expect(url.searchParams.get('intent')).toBe('view');
    expect(url.searchParams.get('owner_venue_id')).toBe('venue-9');
  });
});
