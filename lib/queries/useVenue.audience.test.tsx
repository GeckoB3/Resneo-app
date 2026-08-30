/**
 * C0: the venue bootstrap stops asking once we know the caller is not staff.
 *
 * `VenueProvider` sits in `AppProviders`, above the staff gate, so `GET
 * /api/venue` fires for any session at all. For a customer every one of those
 * is doomed, and TanStack retries.
 *
 * The gate is `role !== 'customer'` rather than `role === 'staff'`, and these
 * tests exist mainly to pin that difference, because the stricter-looking
 * version is the wrong one: it would put every staff member's venue bootstrap
 * behind their staff/me round trip, where today the two run in parallel, and
 * the tabs render off this data.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import type { Role } from '@/lib/queries/useRole';

const state = { role: 'staff' as Role };
const mockApiFetch = jest.fn().mockResolvedValue({ id: 'venue-1', name: 'A Venue' });

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useRole', () => ({ useRole: () => state.role }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useVenue } = require('./useVenue') as typeof import('./useVenue');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockApiFetch.mockClear();
  state.role = 'staff';
});

describe('who asks /api/venue', () => {
  it('a staff member does', async () => {
    // The control. Without it the two tests below would pass on a hook that
    // never fetches for anybody.
    state.role = 'staff';
    await renderHook(() => useVenue(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/venue');
  });

  it('a confirmed CUSTOMER does not, at all', async () => {
    state.role = 'customer';
    await renderHook(() => useVenue(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('someone whose role is still LOADING does, exactly as before', async () => {
    /*
      The assertion that stops this being tightened to `role === 'staff'` by
      someone reading it as an oversight. On first render nobody's role is
      resolved, so gating on a positive staff answer would delay the venue
      bootstrap for every staff member on every launch, to save a customer some
      requests they never see.
    */
    state.role = 'loading';
    await renderHook(() => useVenue(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
  });

  it('someone whose role is UNKNOWN does, because a failed check is not a customer', async () => {
    // Preserves today's fail-soft: a degraded venue API must not also stop the
    // venue bootstrap for the staff it is degraded for.
    state.role = 'unknown';
    await renderHook(() => useVenue(), { wrapper });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
  });
});
