/**
 * What a site switch lets go of outside React (web roles plan §6.2c): the unused rebook, the
 * Terminal Location, and the query cache, last.
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

const mockOrder: string[] = [];
jest.mock('@/lib/payments/connection-token', () => ({
  clearTerminalLocationCache: () => mockOrder.push('terminal location'),
}));
jest.mock('@/lib/queries/queryClient', () => ({
  queryClient: {},
  resetQueriesForSiteChange: () => mockOrder.push('queries'),
}));

import { REBOOK_BOOTSTRAP_KEY, writeRebookBootstrap } from '@/lib/rebook-bootstrap';
import { __resetActiveSiteForTests, onSiteChange, setChosenSite, syncChosenSiteUser } from '@/lib/sites/active-site';
import { __resetSiteSwitchCleanupForTests, registerSiteSwitchCleanup } from '@/lib/sites/site-switch-cleanup';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mockStore.clear();
  mockOrder.length = 0;
  __resetActiveSiteForTests();
  __resetSiteSwitchCleanupForTests();
  syncChosenSiteUser('user-1');
});

it('drops a rebook not yet used at the site being left', async () => {
  registerSiteSwitchCleanup();
  await setChosenSite(SITE_A);
  await writeRebookBootstrap({ v: 1, guest: { firstName: 'Ana' } });
  expect(mockStore.get(`${REBOOK_BOOTSTRAP_KEY}.${SITE_A}`)).toBeDefined();

  await setChosenSite(SITE_B);
  expect(mockStore.has(`${REBOOK_BOOTSTRAP_KEY}.${SITE_A}`)).toBe(false);
});

it('resets the query cache after everything else has let go', async () => {
  registerSiteSwitchCleanup();
  // A context that registers later (the linked venue) still runs before the queries.
  onSiteChange(() => {
    mockOrder.push('linked venue');
  });
  await setChosenSite(SITE_A);
  expect(mockOrder).toEqual(['terminal location', 'linked venue', 'queries']);
});

it('registers once however often it is called', async () => {
  registerSiteSwitchCleanup();
  registerSiteSwitchCleanup();
  await setChosenSite(SITE_A);
  expect(mockOrder.filter((step) => step === 'queries')).toHaveLength(1);
});
