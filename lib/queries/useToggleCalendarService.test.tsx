/**
 * Domain 11 (Services High): non-admin per-calendar offer toggle. Pins the pure
 * set maths (`nextCalendarServiceIds`) and the PUT contract against
 * C:\Resneo/src/app/api/venue/practitioner-services (replace-the-set semantics).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockToken = 'token-A';
const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => mockToken }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import {
  nextCalendarServiceIds,
  useToggleCalendarService,
} from '@/lib/queries/useToggleCalendarService';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => mockApiFetch.mockReset());

describe('nextCalendarServiceIds', () => {
  it('adds the service id (deduped) when enabling', () => {
    expect(nextCalendarServiceIds(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(nextCalendarServiceIds(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
  });

  it('removes the service id when disabling', () => {
    expect(nextCalendarServiceIds(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
    expect(nextCalendarServiceIds(['a'], 'a', false)).toEqual([]);
  });
});

describe('useToggleCalendarService', () => {
  it('PUTs { practitioner_id, service_ids } as the complete next set', async () => {
    mockApiFetch.mockResolvedValueOnce({ success: true });
    const { result } = await renderHook(() => useToggleCalendarService(), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      practitioner_id: 'cal-1',
      service_ids: ['svc-1', 'svc-2'],
    });
    const [path, opts] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/practitioner-services');
    expect((opts as { method: string }).method).toBe('PUT');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      practitioner_id: 'cal-1',
      service_ids: ['svc-1', 'svc-2'],
    });
    expect((opts as { accessToken: string }).accessToken).toBe(mockToken);
  });
});
