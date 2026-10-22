/**
 * The query cache and the chosen site (web roles plan §6.2c): every hash carries the site, a
 * switch clears the cache and the writes queued while offline, screens still open move onto the
 * new site's queries, and no screen is handed the old site's answer as a placeholder.
 */
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));
jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test' }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { QueryObserver, keepPreviousData } from '@tanstack/react-query';

import { SiteScopedQueryClient, resetQueriesForSiteChange, siteQueryKeyHash } from '@/lib/queries/queryClient';
import { __resetActiveSiteForTests, setChosenSite, syncChosenSiteUser } from '@/lib/sites/active-site';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

function makeClient() {
  return new SiteScopedQueryClient({
    // No garbage-collection timers left running after the test.
    defaultOptions: { queries: { queryKeyHashFn: siteQueryKeyHash, retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
}

type Observed<R> = { getCurrentResult: () => R; subscribe: (listener: (result: R) => void) => () => void };

/** Resolve on the observer's next result that satisfies `ready`. */
function nextResult<R>(observer: Observed<R>, ready: (r: R) => boolean) {
  return new Promise<R>((resolve) => {
    const current = observer.getCurrentResult();
    if (ready(current)) {
      resolve(current);
      return;
    }
    const unsubscribe = observer.subscribe((result) => {
      if (ready(result)) {
        unsubscribe();
        resolve(result);
      }
    });
  });
}

beforeEach(() => {
  __resetActiveSiteForTests();
  syncChosenSiteUser('user-1');
});

describe('the query hash carries the site', () => {
  it('differs per site for the same key, and says home with none chosen', async () => {
    const key = ['reserveNI', 'venue', 'bootstrap', 'user-1'];
    const home = siteQueryKeyHash(key);
    expect(home).toContain('"home"');
    await setChosenSite(SITE_A);
    const a = siteQueryKeyHash(key);
    await setChosenSite(SITE_B);
    const b = siteQueryKeyHash(key);
    expect(new Set([home, a, b]).size).toBe(3);
    expect(a).toContain(SITE_A);
  });

  it('keeps partial-key invalidation working', async () => {
    await setChosenSite(SITE_A);
    const client = makeClient();
    client.setQueryData(['reserveNI', 'sites', 'me', 'user-1'], { n: 1 });
    await client.invalidateQueries({ queryKey: ['reserveNI', 'sites'] });
    expect(client.getQueryState(['reserveNI', 'sites', 'me', 'user-1'])?.isInvalidated).toBe(true);
  });
});

describe('switching site', () => {
  it('clears the cache and the writes queued while offline', async () => {
    await setChosenSite(SITE_A);
    const client = makeClient();
    client.setQueryData(['reserveNI', 'staff', 'me', 'user-1'], { staff: { name: 'At A' } });
    client.getMutationCache().build(client, { mutationFn: async () => 'queued', gcTime: Infinity });
    expect(client.getMutationCache().getAll().length).toBe(1);

    await setChosenSite(SITE_B);
    resetQueriesForSiteChange(client);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(client.getQueryData(['reserveNI', 'staff', 'me', 'user-1'])).toBeUndefined();
  });

  it('moves an open screen onto the new site, which fetches, and never shows it the old answer', async () => {
    await setChosenSite(SITE_A);
    const client = makeClient();
    let site = 'A';
    const observer = new QueryObserver(client, {
      queryKey: ['reserveNI', 'calendar', 'user-1', '2026-10-22'],
      queryFn: async () => `bookings at ${site}`,
      placeholderData: keepPreviousData,
    });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => {
      seen.push(result.data);
    });
    const first = await nextResult(observer, (r) => r.isSuccess);
    expect(first.data).toBe('bookings at A');

    site = 'B';
    await setChosenSite(SITE_B);
    resetQueriesForSiteChange(client);

    // Straight after the switch: no data, and certainly not site A's as a placeholder.
    const during = observer.getCurrentResult();
    expect(during.data).toBeUndefined();
    expect(during.isPlaceholderData).toBe(false);

    const after = await nextResult(observer, (r) => r.isSuccess && r.data === 'bookings at B');
    expect(after.data).toBe('bookings at B');
    expect(seen.filter((d) => d === 'bookings at A')).toHaveLength(1);
    unsubscribe();
  });

  it('still hands on the previous answer within one site (paging the calendar)', async () => {
    await setChosenSite(SITE_A);
    const client = makeClient();
    let day = '2026-10-22';
    let resolveSecond: (value: string) => void = () => undefined;
    const observer = new QueryObserver(client, {
      queryKey: ['reserveNI', 'calendar', 'user-1', day],
      queryFn: async () => `bookings on ${day}`,
      placeholderData: keepPreviousData,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await nextResult(observer, (r) => r.isSuccess);

    day = '2026-10-23';
    observer.setOptions({
      queryKey: ['reserveNI', 'calendar', 'user-1', day],
      queryFn: () =>
        new Promise<string>((resolve) => {
          resolveSecond = resolve;
        }),
      placeholderData: keepPreviousData,
    });
    const paging = observer.getCurrentResult();
    expect(paging.isPlaceholderData).toBe(true);
    expect(paging.data).toBe('bookings on 2026-10-22');
    resolveSecond('bookings on 2026-10-23');
    unsubscribe();
  });
});
