/**
 * C1's acceptance, and it is about the crash rather than the screen.
 *
 * The root router mounts `(app)` or `(customer)` behind a `Stack.Protected`
 * guard. Expo Router's documented behaviour is that a guard going from true to
 * false removes every history entry for that screen, and when the screen is a
 * navigator that is an unmount. This app has already died from one: on
 * 2026-08-16 a cold-start notification tap left expo-router with nothing under
 * `__root`, and the resulting remount loop ran at about fifty a second until
 * the process ended. Two separate files carry comments about it.
 *
 * So the property under test is not "the right mode is chosen". It is that the
 * mode NEVER goes from one decided side to the other on its own. Choosing
 * correctly but late is a crash; choosing correctly and once is the design.
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Role } from '@/lib/queries/useRole';
import type { LoginDestination } from '@/lib/queries/useCustomerProfile';

const mockState = {
  role: 'loading' as Role,
  destination: null as LoginDestination | null,
  profileLoading: false,
  profileError: false,
  storedChoice: null as 'staff' | 'customer' | null,
  storeLoaded: true,
  storeNeverResolves: false,
  listeners: new Set<() => void>(),
};

jest.mock('@/lib/queries/useRole', () => ({ useRole: () => mockState.role }));
jest.mock('@/lib/queries/useCustomerProfile', () => ({
  useCustomerProfile: () => ({
    data: mockState.profileError
      ? undefined
      : { profile: { default_login_destination: mockState.destination }, user: null },
    isLoading: mockState.profileLoading,
    isError: mockState.profileError,
  }),
}));
jest.mock('@/lib/mode/app-mode-store', () => ({
  // A real subscription, not a no-op: `choose()` reaching the router depends on
  // the store notifying, and a stubbed subscribe would let that break silently.
  subscribeAppMode: (listener: () => void) => {
    mockState.listeners.add(listener);
    return () => mockState.listeners.delete(listener);
  },
  getCachedAppMode: () => mockState.storedChoice,
  isAppModeLoaded: () => mockState.storeLoaded,
  loadAppMode: async () => {
    if (mockState.storeNeverResolves) await new Promise(() => {});
    return mockState.storedChoice;
  },
  rememberAppMode: (m: 'staff' | 'customer') => {
    mockState.storedChoice = m;
    mockState.listeners.forEach((l) => l());
  },
  clearAppMode: () => {
    mockState.storedChoice = null;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAppMode } = require('./useAppMode') as typeof import('./useAppMode');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockState.role = 'loading';
  mockState.destination = null;
  mockState.profileLoading = false;
  mockState.profileError = false;
  mockState.storedChoice = null;
  mockState.storeLoaded = true;
  mockState.storeNeverResolves = false;
  mockState.listeners.clear();
});

/** Every mode this hook reported, in order, across a scripted sequence. */
async function observe(steps: (() => void)[]): Promise<string[]> {
  const seen: string[] = [];
  const { result, rerender } = await renderHook(() => useAppMode(), { wrapper });
  seen.push(result.current.mode);
  for (const step of steps) {
    // `rerender` is awaited for the same reason `render` is in this repo: it
    // resolves asynchronously, and reading `result.current` before it settles
    // reports the PREVIOUS render, which would make this helper quietly miss
    // exactly the mid-flight swap it exists to catch.
    await act(async () => {
      step();
      await rerender({});
    });
    seen.push(result.current.mode);
  }
  return seen;
}

/** The invariant: at most one decided mode is ever reported. */
function decidedModes(seen: string[]): string[] {
  return [...new Set(seen.filter((m) => m !== 'resolving'))];
}

describe('the routing invariant: a side is decided once, never swapped', () => {
  it('waits rather than guessing, then goes straight to staff', async () => {
    const seen = await observe([
      () => {
        mockState.role = 'staff';
      },
    ]);
    expect(seen[0]).toBe('resolving');
    expect(decidedModes(seen)).toEqual(['staff']);
  });

  it('waits rather than guessing, then goes straight to CUSTOMER', async () => {
    /*
      The sequence that would crash if the router mounted a default side first.
      A customer must never have been staff on the way here, because leaving
      staff means unmounting the staff navigator.
    */
    const seen = await observe([
      () => {
        mockState.role = 'customer';
      },
    ]);
    expect(seen[0]).toBe('resolving');
    expect(decidedModes(seen)).toEqual(['customer']);
  });

  it('a SLOW staff check never mounts a side early', async () => {
    // Crash shape one: a cold start where staff/me is slow. Every tick before
    // the answer must be 'resolving', not a guess that gets corrected.
    const seen = await observe([() => {}, () => {}, () => {}]);
    expect(seen.every((m) => m === 'resolving')).toBe(true);
  });

  it('a FAILING staff check settles on staff without ever being customer', async () => {
    /*
      Crash shape one again, in its other form. `unknown` is a failed check, not
      a customer, and the fail-soft has always been to proceed as staff. What
      must not happen is customer-then-staff.
    */
    const seen = await observe([
      () => {
        mockState.role = 'unknown';
      },
    ]);
    expect(decidedModes(seen)).toEqual(['staff']);
  });

  it('a person whose web preference is their ACCOUNT lands there directly', async () => {
    /*
      Crash shape two: a preference arriving after first paint. The hook reports
      'resolving' until the profile lands, so the router never mounts staff and
      then moves them. Landing correctly but late is the unmount.
    */
    mockState.role = 'staff';
    mockState.profileLoading = true;
    const seen = await observe([
      () => {
        mockState.profileLoading = false;
        mockState.destination = 'account';
      },
    ]);
    expect(seen[0]).toBe('resolving');
    expect(decidedModes(seen)).toEqual(['customer']);
  });

  it('does NOT wait on the profile for a confirmed customer', async () => {
    // There is no decision left for it to inform, and waiting would hold a
    // customer on a loading screen for an answer that cannot change anything.
    mockState.role = 'customer';
    mockState.profileLoading = true;
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe('customer'));
  });

  it('an unreadable profile falls through to staff rather than stranding anyone', async () => {
    // Refusing to route because a preference could not be read would trap
    // somebody on a loading screen over a question whose answer is a default.
    mockState.role = 'staff';
    mockState.profileError = true;
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe('staff'));
  });
});

describe('the switcher', () => {
  it('an explicit choice beats the web preference', async () => {
    // Someone who switched on this device meant it, and should not be moved
    // back by a setting they last touched months ago on a laptop.
    mockState.role = 'staff';
    mockState.destination = 'account';
    mockState.storedChoice = 'staff';
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe('staff'));
  });

  it('is not offered to a confirmed customer, who has no staff side', async () => {
    mockState.role = 'customer';
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.canSwitch).toBe(false));
  });

  it('is offered to staff, who may also be somebody else’s customer', async () => {
    mockState.role = 'staff';
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.canSwitch).toBe(true));
  });

  it('a switch made elsewhere reaches the router', async () => {
    /*
      The store notifies; the router listens. Without that, `switchAppMode` on
      the settings screen would update a module variable and the router, holding
      its copy in component state, would never learn of it. The user taps
      "switch to my account" and watches nothing happen.
    */
    mockState.role = 'staff';
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    await waitFor(() => expect(result.current.mode).toBe('staff'));

    await act(async () => {
      result.current.choose('customer');
    });

    expect(result.current.mode).toBe('customer');
  });

  it('reports resolving until the stored choice has been read', async () => {
    /*
      Otherwise the first paint uses "no preference", picks staff, and then the
      stored 'customer' lands and swaps the navigator.

      The read is held open rather than merely slow, because in practice it
      resolves inside the first render flush; an unblocked version of this test
      passed against a hook that ignored the store entirely, which is no test at
      all.
    */
    mockState.role = 'staff';
    mockState.storeLoaded = false;
    mockState.storeNeverResolves = true;
    const { result } = await renderHook(() => useAppMode(), { wrapper });
    expect(result.current.mode).toBe('resolving');
  });
});
