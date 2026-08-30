/**
 * C0: who the app thinks the signed-in person is.
 *
 * This one answer now decides three things: whether the staff gate lets someone
 * through, which audience their device registers under, and whether the venue
 * bootstrap runs. The audience is the consequential one, because it is written
 * to the database and decides whether somebody receives another venue's booking
 * alerts, which carry a client's name and service.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';


const state = {
  accessToken: 'token-A' as string | null,
  backendConfigured: true,
  /** What GET /api/venue/staff/me does. */
  staffMe: 'ok' as 'ok' | '401' | '500' | 'pending',
};

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => state.backendConfigured }));

jest.mock('@/lib/queries/useAccessToken', () => ({
  useAccessToken: () => state.accessToken,
}));

jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: async () => {
      if (state.staffMe === 'ok') return { staff: { id: 'staff-1' } };
      if (state.staffMe === 'pending') return new Promise(() => {});
      throw new actual.ApiError(
        state.staffMe === '401' ? 'Unauthorised' : 'Server error',
        state.staffMe === '401' ? 401 : 500,
      );
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useRole, audienceForRole } = require('./useRole') as typeof import('./useRole');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.accessToken = 'token-A';
  state.backendConfigured = true;
  state.staffMe = 'ok';
});

describe('useRole', () => {
  it('calls a person with a staff profile staff', async () => {
    const { result } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current).toBe('staff'));
  });

  it('calls a 401 a CUSTOMER, not a dead end', async () => {
    /*
      The single change of meaning in this phase. The staff gate has always read
      a 401 as `not_staff` and shown a terminal screen; the same signal is the
      positive identification of a customer, and reading it that way is what the
      rest of customer mode is built on.
    */
    state.staffMe = '401';
    const { result } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current).toBe('customer'));
  });

  it('does NOT call a server error a customer', async () => {
    /*
      The distinction that stops a venue API outage from looking like every
      staff member becoming a customer. If this collapsed to 'customer', a 500
      would register staff devices under the wrong audience and stop the venue
      bootstrap for people who are staff.
    */
    state.staffMe = '500';
    const { result } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current).toBe('unknown'));
  });

  it('is loading while the check is in flight, not unknown', async () => {
    // Callers treat these differently: loading waits, unknown gives up. A hook
    // that reported unknown first would register a device before the answer
    // arrived.
    state.staffMe = 'pending';
    const { result } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(result.current).toBe('loading'));
  });

  it('is unknown with no session at all', async () => {
    state.accessToken = null;
    const { result } = await renderHook(() => useRole(), { wrapper });
    expect(result.current).toBe('unknown');
  });

  it('is unknown when the backend is not configured, rather than guessing', async () => {
    // A developer with no venue API env vars is not thereby a customer.
    state.backendConfigured = false;
    const { result } = await renderHook(() => useRole(), { wrapper });
    expect(result.current).toBe('unknown');
  });
});

describe('audienceForRole', () => {
  it('maps the two resolved roles', () => {
    expect(audienceForRole('staff')).toBe('staff');
    expect(audienceForRole('customer')).toBe('customer');
  });

  it('refuses to guess for an unresolved role', () => {
    /*
      The property the push provider depends on. A default of 'staff' here would
      exactly reproduce the defect this phase fixes, because the server column
      already defaults to 'staff' and the old client sent nothing.
    */
    expect(audienceForRole('loading')).toBeNull();
    expect(audienceForRole('unknown')).toBeNull();
  });
});
