/**
 * A push for another site switches there before it opens (web roles plan §6.2c), and only then.
 */
const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'token-1' } } }) },
  }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import {
  __resetActiveSiteForTests,
  getChosenSiteId,
  noteActiveVenueId,
  onSiteChange,
  syncChosenSiteUser,
} from '@/lib/sites/active-site';
import { switchSiteForPush } from '@/lib/sites/push-site';

const HOME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function me(activeVenueId: string) {
  return {
    home_venue_id: HOME,
    active_venue_id: activeVenueId,
    sites: [
      { venue_id: HOME, name: 'Northside', role: 'admin', role_key: 'owner', is_owner: true, onboarding_complete: true },
      { venue_id: OTHER, name: 'Southside', role: 'staff', role_key: 'staff', is_owner: false, onboarding_complete: true },
    ],
    pending_invites: [],
    overview_eligible: false,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  __resetActiveSiteForTests();
  syncChosenSiteUser('user-1');
});

it('switches to the site a push names when the phone is on another one, letting go of the old', async () => {
  mockApiFetch.mockResolvedValueOnce(me(HOME));
  const cleared = jest.fn();
  onSiteChange(cleared);

  await expect(switchSiteForPush(OTHER)).resolves.toBe(true);

  expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/me/sites', { accessToken: 'token-1' });
  expect(getChosenSiteId()).toBe(OTHER);
  expect(cleared).toHaveBeenCalledWith({ from: HOME, to: OTHER });
});

it('does nothing for a push about the site the phone acts on', async () => {
  noteActiveVenueId(HOME);
  await expect(switchSiteForPush(HOME)).resolves.toBe(false);
  expect(mockApiFetch).not.toHaveBeenCalled();
  expect(getChosenSiteId()).toBeNull();
});

it('asks the server when it does not know, and stays when the push is for the home site', async () => {
  mockApiFetch.mockResolvedValueOnce(me(HOME));
  await expect(switchSiteForPush(HOME)).resolves.toBe(false);
  expect(getChosenSiteId()).toBeNull();
});

it('does not switch to a site this login no longer belongs to', async () => {
  mockApiFetch.mockResolvedValueOnce(me(HOME));
  await expect(switchSiteForPush('33333333-3333-4333-8333-333333333333')).resolves.toBe(false);
  expect(getChosenSiteId()).toBeNull();
});

it('opens as before when the push names no site, or the sites cannot be read', async () => {
  await expect(switchSiteForPush(null)).resolves.toBe(false);
  mockApiFetch.mockRejectedValueOnce(new Error('offline'));
  await expect(switchSiteForPush(OTHER)).resolves.toBe(false);
  expect(getChosenSiteId()).toBeNull();
});
