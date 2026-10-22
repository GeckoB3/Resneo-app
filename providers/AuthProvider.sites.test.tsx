/**
 * AuthProvider and the chosen site (web roles plan §6.2c): a sign-in the person has just made
 * offers the site picker, a launch with a stored session does not (Supabase calls both SIGNED_IN),
 * and signing out forgets the chosen site.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

type AuthCallback = (event: string, session: { user: { id: string }; access_token: string } | null) => void;
let mockAuthCallback: AuthCallback | null = null;
let mockInitialSession: { user: { id: string }; access_token: string } | null = null;

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockInitialSession } })),
      onAuthStateChange: (callback: AuthCallback) => {
        mockAuthCallback = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  }),
  isSupabaseConfigured: () => true,
}));
jest.mock('@/lib/push/registerDevice', () => ({ registerDevice: jest.fn(), unregisterDevice: jest.fn() }));
jest.mock('@/lib/analytics', () => ({
  ANALYTICS_EVENTS: new Proxy({}, { get: (_t, k) => String(k) }),
  track: jest.fn(),
  identify: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('@/lib/observability', () => ({ setObservabilityUser: jest.fn() }));
jest.mock('@/lib/auth/redirect', () => ({ getAuthCallbackRedirectUrl: () => 'resneo://callback' }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
  configure: () => {},
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import {
  __resetActiveSiteForTests,
  getChosenSiteId,
  isSiteOfferDue,
  setChosenSite,
} from '@/lib/sites/active-site';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const session = (id: string) => ({ user: { id }, access_token: `token-${id}` });

beforeEach(() => {
  mockAuthCallback = null;
  mockInitialSession = null;
  __resetActiveSiteForTests();
});

it('offers the site picker after a sign-in made in this run', async () => {
  await renderHook(() => useAuth(), { wrapper });
  await act(async () => {
    mockAuthCallback?.('INITIAL_SESSION', null);
  });
  expect(isSiteOfferDue()).toBe(false);
  await act(async () => {
    mockAuthCallback?.('SIGNED_IN', session('user-1'));
  });
  expect(isSiteOfferDue()).toBe(true);
});

it('offers nothing on a launch that restores a stored session', async () => {
  mockInitialSession = session('user-1');
  await renderHook(() => useAuth(), { wrapper });
  await act(async () => {
    mockAuthCallback?.('SIGNED_IN', session('user-1'));
  });
  expect(isSiteOfferDue()).toBe(false);
});

it('forgets the chosen site when the session ends', async () => {
  mockInitialSession = session('user-1');
  await renderHook(() => useAuth(), { wrapper });
  await act(async () => {
    await setChosenSite('22222222-2222-4222-8222-222222222222');
  });
  expect(getChosenSiteId()).not.toBeNull();
  await act(async () => {
    mockAuthCallback?.('SIGNED_OUT', null);
  });
  expect(getChosenSiteId()).toBeNull();
});
