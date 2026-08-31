/**
 * Reproduction: where does a customer land the moment they sign in?
 *
 * Reported from the 1.1.0 preview build: signing in as a customer lands on the
 * VENUE dashboard, which then shows "Something went wrong / Unauthorised" as
 * its own queries 401.
 *
 * Unlike the other mode tests, this one uses the REAL `useRole`, because the
 * suspicion is about how role and mode compose during the seconds after a
 * session appears, and mocking the role away is exactly what would hide it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

const mockState = {
  /** What `useAccessToken()` currently reports. Null until it propagates. */
  token: null as string | null,
  /** What GET /api/venue/staff/me does. A customer gets 401. */
  staffMe: '401' as 'ok' | '401' | '500',
};

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({
  useAccessToken: () => mockState.token,
}));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return {
    ...actual,
    apiFetch: async () => {
      if (mockState.staffMe === 'ok') return { staff: { id: 's-1' } };
      throw new actual.ApiError(
        mockState.staffMe === '401' ? 'Unauthorised' : 'Server error',
        mockState.staffMe === '401' ? 401 : 500,
      );
    },
  };
});
jest.mock('@/lib/mode/app-mode-store', () => ({
  subscribeAppMode: () => () => {},
  getCachedAppMode: () => null,
  isAppModeLoaded: () => true,
  loadAppMode: async () => null,
  rememberAppMode: () => {},
  clearAppMode: () => {},
}));
jest.mock('@/lib/queries/useCustomerProfile', () => ({
  useCustomerProfile: () => ({ data: undefined, isLoading: false, isError: true }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAppMode } = require('@/lib/mode/useAppMode') as typeof import('@/lib/mode/useAppMode');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clearLatchedRole } = require('@/lib/queries/useRole') as typeof import('@/lib/queries/useRole');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockState.token = null;
  mockState.staffMe = '401';
  clearLatchedRole();
});

describe('the moment a session appears', () => {
  it('does NOT send a signed-in user to the staff side before the token arrives', async () => {
    /*
      THE BUG. `useAccessToken` reports null for a tick after sign-in: it seeds
      from a module cache that is empty on a cold start and fills in from an
      async getSession(). During that tick `useRole` sees no token and answers
      `unknown`, meaning "we could not find out". `useAppMode` treats `unknown`
      as the fail-soft "assume staff", which is right for a DEGRADED venue API
      and wrong here, because nothing has been asked yet.

      The root router then mounts (app) for a customer, its venue queries 401,
      and the customer reads "Something went wrong / Unauthorised" on a
      dashboard that is not theirs.
    */
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    expect(result.current.mode).not.toBe('staff');
  });

  it('settles on customer once the token propagates and staff/me answers 401', async () => {
    const { result, rerender } = await renderHook(() => useAppMode(), { wrapper });

    await act(async () => {
      mockState.token = 'token-A';
      await rerender({});
    });

    await waitFor(() => expect(result.current.mode).toBe('customer'));
  });

  it('never reports staff at any point on a customer sign-in', async () => {
    /*
      The property that matters, because a single frame of `staff` is enough to
      mount the venue navigator, fire its queries and show the error. Recovering
      afterwards is not good enough: the guard flipping back unmounts a live
      navigator, which is the failure C1 exists to prevent.
    */
    const seen: string[] = [];
    const { result, rerender } = await renderHook(() => useAppMode(), { wrapper });
    seen.push(result.current.mode);

    await act(async () => {
      mockState.token = 'token-A';
      await rerender({});
    });
    seen.push(result.current.mode);

    await waitFor(() => expect(result.current.mode).toBe('customer'));
    seen.push(result.current.mode);

    expect(seen).not.toContain('staff');
  });
});

describe('what must keep working', () => {
  it('still fails soft to staff when the venue API is genuinely broken', async () => {
    // The distinction the fix has to preserve: a 500 means we ASKED and could
    // not find out, and the long-standing behaviour is to let staff through
    // rather than strand them.
    mockState.token = 'token-A';
    mockState.staffMe = '500';
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe('staff'));
  });

  it('sends a real staff member to the staff side', async () => {
    mockState.token = 'token-A';
    mockState.staffMe = 'ok';
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe('staff'));
  });
});
