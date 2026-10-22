/**
 * The chosen site (web roles plan §6.2c): kept across launches for the login that chose it,
 * dropped for anyone else, and every switch lets go of the old site in order.
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
  SITE_HEADER,
  __resetActiveSiteForTests,
  getActingVenueId,
  getChosenSiteId,
  getSiteEpoch,
  isSiteOfferDue,
  markSiteOfferDue,
  noteActiveVenueId,
  onBeforeSiteChange,
  onSiteChange,
  setChosenSite,
  siteHeaders,
  siteScopedKey,
  startChosenSiteHydration,
  syncChosenSiteUser,
  takeSiteOffer,
} from '@/lib/sites/active-site';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mockStore.clear();
  __resetActiveSiteForTests();
});

describe('with no site chosen (one site, or never chosen)', () => {
  it('sends no header, so the server answers for the home site', () => {
    expect(getChosenSiteId()).toBeNull();
    expect(siteHeaders()).toEqual({});
  });

  it('keeps every per-site SecureStore key as it always was', () => {
    expect(siteScopedKey('resneo_in_person_last_method')).toBe('resneo_in_person_last_method');
  });
});

describe('choosing a site', () => {
  it('names it on every request and in the per-site keys', async () => {
    syncChosenSiteUser('user-1');
    await setChosenSite(SITE_A);
    expect(siteHeaders()).toEqual({ [SITE_HEADER]: SITE_A });
    expect(siteScopedKey('resneo_stock_prompt_dismissed')).toBe(`resneo_stock_prompt_dismissed.${SITE_A}`);
    expect(getActingVenueId()).toBe(SITE_A);
  });

  it('awaits the before handlers, then changes the epoch, then runs the after handlers in order', async () => {
    syncChosenSiteUser('user-1');
    const calls: string[] = [];
    onBeforeSiteChange(async (change) => {
      calls.push(`before ${String(change.to)} epoch=${getSiteEpoch()} chosen=${String(getChosenSiteId())}`);
    });
    onSiteChange(() => {
      calls.push(`queries epoch=${getSiteEpoch()}`);
    }, 100);
    onSiteChange((change) => {
      calls.push(`linked from=${String(change.from)} chosen=${String(getChosenSiteId())}`);
    });

    noteActiveVenueId(SITE_A);
    await setChosenSite(SITE_B);

    expect(calls).toEqual([
      `before ${SITE_B} epoch=0 chosen=null`,
      `linked from=${SITE_A} chosen=${SITE_B}`,
      'queries epoch=1',
    ]);
  });

  it('does nothing when the same site is chosen again', async () => {
    syncChosenSiteUser('user-1');
    await setChosenSite(SITE_A);
    const after = jest.fn();
    onSiteChange(after);
    await setChosenSite(SITE_A);
    expect(after).not.toHaveBeenCalled();
    expect(getSiteEpoch()).toBe(1);
  });

  it('keeps switching when a handler throws', async () => {
    syncChosenSiteUser('user-1');
    const later = jest.fn();
    onSiteChange(() => {
      throw new Error('boom');
    });
    onSiteChange(later);
    await setChosenSite(SITE_A);
    expect(later).toHaveBeenCalled();
    expect(getChosenSiteId()).toBe(SITE_A);
  });
});

describe('across launches', () => {
  it('restores the choice for the same login', async () => {
    syncChosenSiteUser('user-1');
    await setChosenSite(SITE_A);

    __resetActiveSiteForTests();
    await startChosenSiteHydration();
    syncChosenSiteUser('user-1');
    await Promise.resolve();
    expect(getChosenSiteId()).toBe(SITE_A);
  });

  it('drops a choice made by a different login', async () => {
    syncChosenSiteUser('user-1');
    await setChosenSite(SITE_A);

    __resetActiveSiteForTests();
    await startChosenSiteHydration();
    syncChosenSiteUser('user-2');
    await Promise.resolve();
    expect(getChosenSiteId()).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it('forgets the choice on sign-out', async () => {
    syncChosenSiteUser('user-1');
    await setChosenSite(SITE_A);
    syncChosenSiteUser(null);
    expect(getChosenSiteId()).toBeNull();
    expect(siteHeaders()).toEqual({});
  });
});

describe('the offer after sign-in', () => {
  it('is taken once', () => {
    markSiteOfferDue();
    expect(isSiteOfferDue()).toBe(true);
    expect(takeSiteOffer()).toBe(true);
    expect(takeSiteOffer()).toBe(false);
  });

  it('is withdrawn by signing out', () => {
    markSiteOfferDue();
    syncChosenSiteUser(null);
    expect(isSiteOfferDue()).toBe(false);
  });
});
