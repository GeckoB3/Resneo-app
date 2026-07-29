/**
 * useAccessToken — the token must survive a remount.
 *
 * Every other suite in the repo mocks this hook to the constant `'token-A'`, so
 * the window in which a FRESH instance is still signed-out was invisible to all
 * 1100+ tests. That window is what made the payment sheet fail with "Missing
 * access token" on the first tap after reader pairing: returning from pairing
 * re-mounts `CardCollectSection`, which auto-collects immediately, and the
 * mutation ran before the new instance's `getSession()` had resolved. A second,
 * manual press then worked, which is what made the bug baffling.
 *
 * Each test drives the auth state it depends on, so none of them rely on the
 * order the process-wide token cache happens to be left in.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

let mockConfigured = true;
jest.mock('@/lib/env', () => ({
  isBackendConfigured: () => mockConfigured,
}));

let mockSessionToken: string | null = 'token-A';
const mockGetSession = jest.fn(
  async (): Promise<{ data: { session: { access_token: string } | null } }> => ({
    data: { session: mockSessionToken ? { access_token: mockSessionToken } : null },
  }),
);
const mockUnsubscribe = jest.fn();
/** The listener the hook registers, so a test can drive a real auth event. */
let authListener: ((event: string, session: { access_token: string } | null) => void) | null = null;
const mockOnAuthStateChange = jest.fn(
  (cb: (event: string, session: { access_token: string } | null) => void) => {
    authListener = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  },
);
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: mockGetSession, onAuthStateChange: mockOnAuthStateChange },
  }),
}));

import { useAccessToken } from '@/lib/queries/useAccessToken';

/** Renders the token so assertions can read it straight off the output. */
function TokenProbe() {
  const token = useAccessToken();
  return <Text>{token ?? 'signed-out'}</Text>;
}

/**
 * Toggling `mounted` off unmounts the hook and nothing else — the house pattern
 * for teardown cases here, since an explicit root unmount corrupts the shared
 * container for the tests that follow.
 */
function Probe({ mounted }: { mounted: boolean }) {
  return mounted ? <TokenProbe /> : null;
}

/**
 * Make the NEXT `getSession()` hang for good.
 *
 * Every remount assertion below is about the frame before a fresh fetch has
 * resolved. Without this they are vacuous: an awaited `act` drains the fetch's
 * microtasks before the assertion runs, so the fetch supplies the same value the
 * cache would and the test passes with the cache deleted. A hung fetch leaves
 * the cache as the only possible source. (A never-settling promise holds no
 * timer or handle, so it cannot leak into another test.)
 */
function freezeNextSessionFetch() {
  mockGetSession.mockImplementationOnce(() => new Promise(() => {}));
}

beforeEach(() => {
  mockConfigured = true;
  mockSessionToken = 'token-A';
  mockGetSession.mockClear();
  mockOnAuthStateChange.mockClear();
  mockUnsubscribe.mockClear();
  authListener = null;
});

it('gives a remount the token on its very first render', async () => {
  const { rerender } = await render(<Probe mounted />);
  // The first instance pays the async cost, which is what populates the cache.
  await waitFor(() => expect(screen.getByText('token-A')).toBeTruthy());

  // Tear the instance down, then mount a brand-new one against a hung fetch.
  await rerender(<Probe mounted={false} />);
  freezeNextSessionFetch();
  await act(async () => {
    rerender(<Probe mounted />);
  });

  /**
   * THE REGRESSION. The fresh instance's own fetch is frozen, so this can only
   * be satisfied by the shared cache. Before it, this frame read 'signed-out' —
   * and the payment sheet's auto-collect fires inside exactly this frame.
   */
  expect(screen.getByText('token-A')).toBeTruthy();
});

it('clears the shared token on sign-out, so a later mount is never stale', async () => {
  /**
   * A value distinct from the cache's, so waiting for it proves THIS instance's
   * own `getSession()` has settled. Waiting on the cached value instead lets the
   * fetch still be in flight, and it then lands after the sign-out below and
   * clobbers it.
   */
  mockSessionToken = 'token-initial';
  const { rerender } = await render(<Probe mounted />);
  await waitFor(() => expect(screen.getByText('token-initial')).toBeTruthy());

  // A cache that survived sign-out would hand a dead token to the next mount,
  // which is the one direction where caching could do real harm.
  await act(async () => {
    authListener?.('SIGNED_OUT', null);
  });
  await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());

  await rerender(<Probe mounted={false} />);
  freezeNextSessionFetch();
  await act(async () => {
    rerender(<Probe mounted />);
  });

  // The session is deliberately still non-null, so 'signed-out' here can only
  // mean the cache was genuinely cleared.
  expect(screen.getByText('signed-out')).toBeTruthy();
});

it('picks up a rotated token for later mounts', async () => {
  // Distinct from the cached value, for the same reason as the sign-out case.
  mockSessionToken = 'token-initial';
  const { rerender } = await render(<Probe mounted />);
  await waitFor(() => expect(screen.getByText('token-initial')).toBeTruthy());

  // Supabase rotates the access token periodically; the cache must follow it
  // rather than pinning whatever the first instance happened to see.
  await act(async () => {
    authListener?.('TOKEN_REFRESHED', { access_token: 'token-B' });
  });
  await waitFor(() => expect(screen.getByText('token-B')).toBeTruthy());

  await rerender(<Probe mounted={false} />);
  freezeNextSessionFetch();
  await act(async () => {
    rerender(<Probe mounted />);
  });

  expect(screen.getByText('token-B')).toBeTruthy();
});

it('never touches Supabase without a configured backend', async () => {
  mockConfigured = false;
  await render(<Probe mounted />);

  await act(async () => {});
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockOnAuthStateChange).not.toHaveBeenCalled();
});

it('unsubscribes the auth listener when the last instance goes away', async () => {
  const { rerender } = await render(<Probe mounted />);
  await act(async () => {});
  expect(mockOnAuthStateChange).toHaveBeenCalled();

  await rerender(<Probe mounted={false} />);
  expect(mockUnsubscribe).toHaveBeenCalled();
});
