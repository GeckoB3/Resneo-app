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
import { renderHook, waitFor, act } from '@testing-library/react-native';
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

const { useRole, audienceForRole, clearLatchedRole } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./useRole') as typeof import('./useRole');

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
  clearLatchedRole();
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

describe('the hourly token refresh (C1 crash shape three)', () => {
  /*
    `useStaffMe` is keyed on the access token, which Supabase rotates roughly
    hourly, and a new key means no cached result.

    Staff survive that because `keepPreviousData` carries their profile across
    the re-key. A CUSTOMER has no profile to carry: their settled answer is a
    401, and keepPreviousData does not carry errors. So without a latch the
    query returns to pending, the role returns to 'loading', and the root router
    unmounts the customer's navigator to show a loading screen. Every hour, to
    every customer.

    This is the failure C1's acceptance was written to catch, and it was found
    by writing the acceptance rather than by running it.
  */
  it('a customer stays a customer when the token rotates', async () => {
    state.staffMe = '401';
    const { result: first } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(first.current).toBe('customer'));

    // The refresh: a new token, and a query that has not answered yet.
    state.accessToken = 'token-B';
    state.staffMe = 'pending';
    const { result: afterRefresh } = await renderHook(() => useRole(), { wrapper });
    expect(afterRefresh.current).toBe('customer');
  });

  it('a staff member stays staff when the token rotates', async () => {
    state.staffMe = 'ok';
    const { result: first } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(first.current).toBe('staff'));

    state.accessToken = 'token-B';
    state.staffMe = 'pending';
    const { result: afterRefresh } = await renderHook(() => useRole(), { wrapper });
    expect(afterRefresh.current).toBe('staff');
  });

  it('does NOT latch unknown, which is the absence of an answer', async () => {
    /*
      Latching a failed check would make one bad launch permanent: a staff
      member who hit a 500 would never be recognised again, however many
      successful checks followed.
    */
    state.staffMe = '500';
    const { result: first } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(first.current).toBe('unknown'));

    state.staffMe = 'ok';
    const { result: retry } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(retry.current).toBe('staff'));
  });

  it('an unknown followed by a 401 is a CUSTOMER, not a latched staff', async () => {
    /*
      The assertion the previous test cannot make. Latching `unknown` as staff
      would ALSO end with 'staff' there, so that test passes against the bug;
      a sweep found exactly that. This is the sequence where the two answers
      differ, and it is the one that matters: a customer whose first check hit
      a 500 would otherwise be permanently mistaken for staff, shown a venue app
      they cannot use, and registered as a staff push device.
    */
    state.staffMe = '500';
    const { result: degraded } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(degraded.current).toBe('unknown'));

    state.staffMe = '401';
    const { result: settled } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(settled.current).toBe('customer'));
  });

  it('forgets the role when the session goes, so a shared device inherits nothing', async () => {
    state.staffMe = '401';
    const { result: first } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(first.current).toBe('customer'));

    // Signed out.
    state.accessToken = null;
    const { result: signedOut } = await renderHook(() => useRole(), { wrapper });
    expect(signedOut.current).toBe('unknown');

    // The next person on this device is staff, and must not inherit 'customer'.
    state.accessToken = 'token-C';
    state.staffMe = 'ok';
    const { result: next } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(next.current).toBe('staff'));
  });
});

describe('the latch settles once and is shared', () => {
  it('a second consumer sees a role the first one settled', async () => {
    /*
      The latch notifies its subscribers. Without that, two hooks in the same
      tree could disagree: the router might have a settled role while the push
      provider still read `loading`, and the device would register under no
      audience at all, or under the wrong one.
    */
    state.staffMe = '401';
    const { result: first } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(first.current).toBe('customer'));

    // A fresh consumer, mounting after the fact, with the query now pending.
    state.staffMe = 'pending';
    const { result: second } = await renderHook(() => useRole(), { wrapper });
    expect(second.current).toBe('customer');
  });

  it('re-renders a consumer that was already mounted when it settled', async () => {
    /*
      The latch notifies. A consumer mounted while the answer was still in
      flight must learn it, and a fresh mount reading the current value proves
      nothing about that, because it reads the value directly.

      It matters because the consumers settle at different times: the router
      decides where to send someone, and the push provider decides which
      audience to register. A provider left on `loading` after the router had
      moved on would register no device at all.
    */
    state.staffMe = 'pending';
    const { result: waiting } = await renderHook(() => useRole(), { wrapper });
    expect(waiting.current).toBe('loading');

    // Another consumer settles the answer.
    state.staffMe = '401';
    await renderHook(() => useRole(), { wrapper });

    await waitFor(() => expect(waiting.current).toBe('customer'));
  });

  it('a later successful check does not promote a settled customer to staff', async () => {
    /*
      The reachable direction of the overwrite. `keepPreviousData` already stops
      staff sliding to customer, because their profile is carried across a
      re-key; nothing carries a 401, so customer-to-staff is the move that can
      actually happen, and it is a navigator unmount.
    */
    state.staffMe = '401';
    const { result: asCustomer } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(asCustomer.current).toBe('customer'));

    state.accessToken = 'token-B';
    state.staffMe = 'ok';
    const { result: later } = await renderHook(() => useRole(), { wrapper });

    /*
      Settle FIRST, then assert. A `waitFor` here would pass on its very first
      check, before the competing staff answer had even arrived, and so would
      pass against a latch that gets overwritten a millisecond later. A sweep
      found exactly that: the mutation survived a test that looked right.
    */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(later.current).toBe('customer');
  });

  it('cannot be moved from one role to the other mid-session', async () => {
    /*
      The property that makes the routing safe. Moving the latch is a mode
      change, and a mode change unmounts a navigator. Whatever a later check
      says, a session that has settled stays settled until sign-out.
    */
    state.staffMe = 'ok';
    const { result: asStaff } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(asStaff.current).toBe('staff'));

    // A later check that disagrees. It must not move anybody.
    state.accessToken = 'token-B';
    state.staffMe = '401';
    const { result: later } = await renderHook(() => useRole(), { wrapper });
    await waitFor(() => expect(later.current).toBe('staff'));
  });
});
