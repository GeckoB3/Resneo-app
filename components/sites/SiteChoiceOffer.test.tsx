/**
 * After signing in, the site picker is offered once, and only to someone with more than one site
 * or an invitation waiting (web roles plan §6.2c).
 */
import { act, render } from '@testing-library/react-native';

import type { MeSites } from '@/types/sites';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

let mockSites: { data?: MeSites; isError?: boolean } = {};
const mockUseMeSites = jest.fn();
jest.mock('@/lib/queries/useMeSites', () => ({
  useMeSites: (options: { enabled?: boolean }) => {
    mockUseMeSites(options);
    return mockSites;
  },
}));
const mockToast = { info: jest.fn(), success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { SiteChoiceOffer } from '@/components/sites/SiteChoiceOffer';
import {
  __resetActiveSiteForTests,
  isSiteLost,
  isSiteOfferDue,
  markSiteLost,
  markSiteOfferDue,
} from '@/lib/sites/active-site';

const site = (id: string) => ({
  venue_id: id,
  name: id,
  role: 'admin' as const,
  role_key: 'admin' as const,
  is_owner: false,
  onboarding_complete: true,
});

function me(overrides: Partial<MeSites>): MeSites {
  return {
    home_venue_id: 'a',
    active_venue_id: 'a',
    sites: [site('a')],
    pending_invites: [],
    overview_eligible: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockToast.info.mockClear();
  mockUseMeSites.mockClear();
  mockSites = {};
  __resetActiveSiteForTests();
});

it('offers the picker after a sign-in to someone with two sites, once', async () => {
  markSiteOfferDue();
  mockSites = { data: me({ sites: [site('a'), site('b')] }) };
  const view = await render(<SiteChoiceOffer ready />);
  expect(mockPush).toHaveBeenCalledWith('/sites?welcome=1');
  expect(isSiteOfferDue()).toBe(false);

  await act(async () => {
    view.rerender(<SiteChoiceOffer ready />);
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it('offers it for an invitation waiting', async () => {
  markSiteOfferDue();
  mockSites = {
    data: me({ pending_invites: [{ staff_id: 's', venue_id: 'b', venue_name: 'B', role_key: 'staff', invited_at: null }] }),
  };
  await render(<SiteChoiceOffer ready />);
  expect(mockPush).toHaveBeenCalledWith('/sites?welcome=1');
});

it('offers nothing to someone with one site and nothing waiting', async () => {
  markSiteOfferDue();
  mockSites = { data: me({}) };
  await render(<SiteChoiceOffer ready />);
  expect(mockPush).not.toHaveBeenCalled();
  expect(isSiteOfferDue()).toBe(false);
});

it('offers nothing on a launch with a stored session, and asks nothing', async () => {
  mockSites = { data: me({ sites: [site('a'), site('b')] }) };
  await render(<SiteChoiceOffer ready />);
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockUseMeSites).toHaveBeenLastCalledWith({ enabled: false });
});

it('waits for the staff check before offering', async () => {
  markSiteOfferDue();
  mockSites = { data: me({ sites: [site('a'), site('b')] }) };
  const view = await render(<SiteChoiceOffer ready={false} />);
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => {
    view.rerender(<SiteChoiceOffer ready />);
  });
  expect(mockPush).toHaveBeenCalledWith('/sites?welcome=1');
});

it('says once that the chosen site is no longer this login’s, after the staff check', async () => {
  markSiteLost();
  const view = await render(<SiteChoiceOffer ready={false} />);
  expect(mockToast.info).not.toHaveBeenCalled();
  await act(async () => {
    view.rerender(<SiteChoiceOffer ready />);
  });
  expect(mockToast.info).toHaveBeenCalledWith('You no longer have access to that site.');
  expect(isSiteLost()).toBe(false);
  await act(async () => {
    view.rerender(<SiteChoiceOffer ready />);
  });
  expect(mockToast.info).toHaveBeenCalledTimes(1);
});

it('gives up quietly when the sites cannot be read (an older server)', async () => {
  markSiteOfferDue();
  mockSites = { isError: true };
  await render(<SiteChoiceOffer ready />);
  expect(mockPush).not.toHaveBeenCalled();
  expect(isSiteOfferDue()).toBe(false);
});
