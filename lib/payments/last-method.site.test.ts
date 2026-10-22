/**
 * The last card method used is remembered per site (web roles plan §6.2c): one business may use a
 * WisePad and another Tap to Pay, so a switch never carries the choice across.
 */
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import {
  __resetLastMethodForTests,
  getCachedLastMethod,
  loadLastMethod,
  rememberLastMethod,
} from '@/lib/payments/last-method';
import { __resetActiveSiteForTests, setChosenSite, syncChosenSiteUser } from '@/lib/sites/active-site';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mockStore.clear();
  __resetActiveSiteForTests();
  __resetLastMethodForTests();
  syncChosenSiteUser('user-1');
});

it('keeps the single-site key when no site is chosen', async () => {
  rememberLastMethod('bluetooth');
  await Promise.resolve();
  expect(mockStore.get('resneo_in_person_last_method')).toBe('bluetooth');
});

it('does not carry one site’s method to another', async () => {
  await setChosenSite(SITE_A);
  rememberLastMethod('bluetooth');
  expect(getCachedLastMethod()).toBe('bluetooth');

  await setChosenSite(SITE_B);
  expect(getCachedLastMethod()).toBeNull();
  await expect(loadLastMethod()).resolves.toBeNull();

  await setChosenSite(SITE_A);
  await expect(loadLastMethod()).resolves.toBe('bluetooth');
});
