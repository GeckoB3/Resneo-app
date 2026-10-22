/**
 * Links from the app into the web dashboard name the business the app is showing (web roles plan
 * §6.2b, "Deep links"): `?site=<venue_id>` on a dashboard, onboarding or POS receipt URL, merged
 * with the query already there and kept before any `#hash`. Everything else keeps its URL.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getWebUrl: () => 'https://web.example.test',
}));

import { __resetActiveSiteForTests, noteActiveVenueId } from '@/lib/sites/active-site';
import { isSiteId, isWebDashboardLink, linkSiteId, withActingSite, withSiteParam } from '@/lib/sites/web-links';

const WEB = 'https://web.example.test';
const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  __resetActiveSiteForTests();
});

describe('withSiteParam', () => {
  it('adds the site to a bare dashboard path', () => {
    expect(withSiteParam('/dashboard', SITE)).toBe(`/dashboard?site=${SITE}`);
    expect(withSiteParam('/dashboard/orders/o1/packing-slip', SITE)).toBe(`/dashboard/orders/o1/packing-slip?site=${SITE}`);
  });

  it('keeps the query already there, and adds the site after it', () => {
    expect(withSiteParam('/dashboard/settings?tab=plan', SITE)).toBe(`/dashboard/settings?tab=plan&site=${SITE}`);
    expect(withSiteParam('/dashboard/orders/packing-slips?ids=a,b', SITE)).toBe(
      `/dashboard/orders/packing-slips?ids=a,b&site=${SITE}`,
    );
    expect(withSiteParam('/dashboard?', SITE)).toBe(`/dashboard?site=${SITE}`);
  });

  it('replaces a site already there rather than adding a second', () => {
    expect(withSiteParam(`/dashboard/settings?site=${OTHER}&tab=plan`, SITE)).toBe(`/dashboard/settings?tab=plan&site=${SITE}`);
    expect(withSiteParam(`/dashboard?site=${OTHER}`, SITE)).toBe(`/dashboard?site=${SITE}`);
    // Only a parameter named exactly `site`.
    expect(withSiteParam('/dashboard?website=x', SITE)).toBe(`/dashboard?website=x&site=${SITE}`);
  });

  it('keeps a #hash at the end', () => {
    expect(withSiteParam('/dashboard/settings#hours', SITE)).toBe(`/dashboard/settings?site=${SITE}#hours`);
    expect(withSiteParam('/dashboard/settings?tab=plan#hours', SITE)).toBe(`/dashboard/settings?tab=plan&site=${SITE}#hours`);
  });

  it('adds the site to a full URL on the web origin', () => {
    expect(withSiteParam(`${WEB}/dashboard/settings?tab=plan`, SITE)).toBe(`${WEB}/dashboard/settings?tab=plan&site=${SITE}`);
    expect(withSiteParam('HTTPS://WEB.example.test/dashboard', SITE)).toBe(`HTTPS://WEB.example.test/dashboard?site=${SITE}`);
    // A fallback origin the caller is using, passed in.
    expect(withSiteParam('https://fallback.example.test/dashboard', SITE, 'https://fallback.example.test')).toBe(
      `https://fallback.example.test/dashboard?site=${SITE}`,
    );
  });

  it('covers onboarding and POS receipts, as the web middleware does', () => {
    expect(withSiteParam('/onboarding', SITE)).toBe(`/onboarding?site=${SITE}`);
    expect(withSiteParam('/onboarding/business?step=2', SITE)).toBe(`/onboarding/business?step=2&site=${SITE}`);
    expect(withSiteParam('/pos-receipt/abc', SITE)).toBe(`/pos-receipt/abc?site=${SITE}`);
  });

  it('leaves every other path as it is', () => {
    for (const path of [
      '/book/glow-bar',
      '/book',
      '/vouchers/glow-bar',
      '/help/settings/calendars',
      '/super',
      '/dashboards',
      '/dashboard-home',
      '/api/venue/dashboard-home',
      '/',
    ]) {
      expect(withSiteParam(path, SITE)).toBe(path);
    }
  });

  it('leaves a URL on another origin, or another scheme, as it is', () => {
    for (const url of [
      'https://dashboard.stripe.com/dashboard',
      'https://evil.example/dashboard/settings',
      `${WEB}.evil.example/dashboard`,
      'https://web.example.test@evil.example/dashboard',
      '//web.example.test/dashboard',
      'mailto:hello@example.com',
      'tel:+441234567890',
      'dashboard/settings',
      '',
      `${WEB}`,
    ]) {
      expect(withSiteParam(url, SITE)).toBe(url);
    }
  });

  it('changes nothing without a venue id the web would accept', () => {
    expect(withSiteParam('/dashboard/settings?tab=plan', null)).toBe('/dashboard/settings?tab=plan');
    expect(withSiteParam('/dashboard/settings?tab=plan', undefined)).toBe('/dashboard/settings?tab=plan');
    expect(withSiteParam('/dashboard/settings?tab=plan', '')).toBe('/dashboard/settings?tab=plan');
    expect(withSiteParam('/dashboard/settings?tab=plan', 'v1')).toBe('/dashboard/settings?tab=plan');
  });

  it('leaves a full URL alone when there is no web origin to compare with', () => {
    expect(withSiteParam(`${WEB}/dashboard`, SITE, '')).toBe(`${WEB}/dashboard`);
    // A bare path needs no origin.
    expect(withSiteParam('/dashboard', SITE, '')).toBe(`/dashboard?site=${SITE}`);
  });
});

describe('isWebDashboardLink', () => {
  it('is a dashboard, onboarding or POS receipt path, bare or on the web origin', () => {
    expect(isWebDashboardLink('/dashboard')).toBe(true);
    expect(isWebDashboardLink('/dashboard/settings?tab=plan')).toBe(true);
    expect(isWebDashboardLink('/dashboard#x')).toBe(true);
    expect(isWebDashboardLink(`${WEB}/dashboard/orders/o1/packing-slip`)).toBe(true);
    expect(isWebDashboardLink('/onboarding')).toBe(true);
    expect(isWebDashboardLink('/pos-receipt/abc')).toBe(true);
  });

  it('is not anything else', () => {
    expect(isWebDashboardLink('/book/glow-bar')).toBe(false);
    expect(isWebDashboardLink('/help/settings')).toBe(false);
    expect(isWebDashboardLink('https://other.example/dashboard')).toBe(false);
    expect(isWebDashboardLink('mailto:a@b.c')).toBe(false);
  });
});

describe('the venue a link names', () => {
  it('is the loaded venue, else the site this phone acts on, else none', () => {
    expect(linkSiteId(SITE)).toBe(SITE);
    expect(linkSiteId(null)).toBeNull();
    noteActiveVenueId(OTHER);
    expect(linkSiteId(null)).toBe(OTHER);
    expect(linkSiteId(undefined)).toBe(OTHER);
    // A loaded id the web would not accept falls back too.
    expect(linkSiteId('v1')).toBe(OTHER);
    expect(linkSiteId(SITE)).toBe(SITE);
  });

  it('withActingSite names the site this phone acts on, and nothing when none is known', () => {
    expect(withActingSite('/dashboard/settings?tab=payments')).toBe('/dashboard/settings?tab=payments');
    noteActiveVenueId(SITE);
    expect(withActingSite('/dashboard/settings?tab=payments')).toBe(`/dashboard/settings?tab=payments&site=${SITE}`);
    expect(withActingSite('/book/glow-bar')).toBe('/book/glow-bar');
  });

  it('isSiteId accepts a uuid only', () => {
    expect(isSiteId(SITE)).toBe(true);
    expect(isSiteId(SITE.toUpperCase())).toBe(true);
    expect(isSiteId('v1')).toBe(false);
    expect(isSiteId(null)).toBe(false);
  });
});
