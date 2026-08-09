/**
 * Minimum-query gate on the linked-venue client search (web parity R11-3).
 *
 * The route grew a `MIN_QUERY_LENGTH` of 2 (resneo #127, finding `P-03`): below
 * it the server returns `[]` rather than the head of the client list, because
 * browsing a partner venue's whole client book is an enumeration primitive
 * rather than a search. The hook's doc-comment claimed it gated on `enabled`
 * but didn't, so every keystroke — including an empty box — hit the network.
 *
 * The placeholder case is the subtle one: `placeholderData: (prev) => prev`
 * carries data across query-key changes, so backspacing "sam" → "s" would leave
 * the previous matches on screen under a query we refuse to run.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({
  isBackendConfigured: () => true,
  getApiUrl: () => 'https://api.test',
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import {
  LINKED_GUEST_MIN_QUERY_LENGTH,
  useLinkedGuests,
} from '@/lib/queries/useLinkedCalendar';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

describe('useLinkedGuests minimum-query gate', () => {
  it.each([
    ['an empty query', ''],
    ['whitespace only', '   '],
    ['a single character', 's'],
    ['a single character with padding', '  s  '],
  ])('does not call the route for %s', async (_label, query) => {
    const { result } = await renderHook(() => useLinkedGuests('venue-1', query), {
      wrapper: makeWrapper(),
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('calls the route at exactly the minimum length, with the trimmed query', async () => {
    mockApiFetch.mockResolvedValueOnce({ guests: [{ id: 'g1', name: 'Sam', email: null }] });
    const query = ' '.repeat(2) + 'sa' + ' ';
    expect(query.trim().length).toBe(LINKED_GUEST_MIN_QUERY_LENGTH);

    const { result } = await renderHook(() => useLinkedGuests('venue-1', query), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/linked-calendar/guests?venueId=venue-1&q=sa');
    expect((opts as { accessToken: string }).accessToken).toBe(mockToken);
    expect(result.current.data?.guests).toHaveLength(1);
  });

  it('stays idle without a venue, however long the query', async () => {
    const { result } = await renderHook(() => useLinkedGuests(null, 'samantha'), {
      wrapper: makeWrapper(),
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('drops the previous matches when the query falls below the minimum', async () => {
    mockApiFetch.mockResolvedValueOnce({ guests: [{ id: 'g1', name: 'Sam', email: null }] });
    const wrapper = makeWrapper();
    const { result, rerender } = await renderHook(
      ({ q }: { q: string }) => useLinkedGuests('venue-1', q),
      { wrapper, initialProps: { q: 'sam' } },
    );

    await waitFor(() => expect(result.current.data?.guests).toHaveLength(1));

    // Backspace to one character: the gate closes, and the old matches must not
    // ride along on placeholderData.
    await rerender({ q: 's' });
    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
