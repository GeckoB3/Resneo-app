/**
 * The site picker's decisions and words (web roles plan §6.2c, §6.7, Appendix C).
 */
import {
  SITES_COPY,
  groupTotalNotes,
  offersSitePickerAfterSignIn,
  planStatusLabel,
  showsSitePicker,
  siteRoleLabel,
  sitesCountedIn,
} from '@/lib/sites/sites';
import type { MeSites, OverviewGroup, OverviewSite } from '@/types/sites';

const site = (id: string) => ({
  venue_id: id,
  name: id,
  role: 'admin' as const,
  role_key: 'admin' as const,
  is_owner: false,
  onboarding_complete: true,
});

function me(overrides: Partial<MeSites>): MeSites {
  return { home_venue_id: 'a', active_venue_id: 'a', sites: [site('a')], pending_invites: [], overview_eligible: false, ...overrides };
}

describe('who sees the picker', () => {
  it('is nobody with one site and nothing waiting, or before the sites are known', () => {
    expect(showsSitePicker(undefined)).toBe(false);
    expect(showsSitePicker(me({}))).toBe(false);
    expect(offersSitePickerAfterSignIn(me({}))).toBe(false);
  });

  it('is anyone with two sites or an invitation waiting', () => {
    const two = me({ sites: [site('a'), site('b')] });
    const invited = me({ pending_invites: [{ staff_id: 's', venue_id: 'b', venue_name: 'B', role_key: 'staff', invited_at: null }] });
    expect(showsSitePicker(two)).toBe(true);
    expect(showsSitePicker(invited)).toBe(true);
    expect(offersSitePickerAfterSignIn(two)).toBe(true);
    expect(offersSitePickerAfterSignIn(invited)).toBe(true);
  });
});

it('names roles as the Team screen does', () => {
  expect(siteRoleLabel({ role_key: 'admin', is_owner: true })).toBe('Owner');
  expect(siteRoleLabel({ role_key: 'front_desk' })).toBe('Front desk');
  expect(siteRoleLabel({ role_key: null })).toBe('Staff');
});

it("words plan statuses as the web's Sites page and All sites cards do", () => {
  expect(planStatusLabel('active')).toBe('Active');
  expect(planStatusLabel('trialing')).toBe('Free trial');
  expect(planStatusLabel('past_due')).toBe('Payment due');
  expect(planStatusLabel('cancelling')).toBe('Ending soon');
  expect(planStatusLabel('cancelled')).toBe('Subscription ended');
});

it('notes a total that leaves a site out, and sites past the first 20', () => {
  const s = (name: string, state: OverviewSite['state']): OverviewSite => ({
    venue_id: name,
    name,
    timezone: 'Europe/London',
    currency: 'GBP',
    role_key: 'owner',
    is_owner: true,
    can_open_plan: true,
    state,
    plan: { tier: 'plus', status: 'active' },
  });
  const group: OverviewGroup = { label: 'Your businesses', sites: [s('A', 'ok'), s('B', 'error'), s('C', 'not_loaded')], totals: null };
  expect(groupTotalNotes(group)).toEqual(["Total leaves out B, which didn't load.", 'Figures shown for your first 20 sites.']);
  expect(sitesCountedIn(group.sites, 'GBP')).toBe(1);
});

it('has no em-dash in any of its words', () => {
  const words = Object.values(SITES_COPY).map((v) => (typeof v === 'function' ? (v as (...a: unknown[]) => string)('X', 2) : v));
  const emDash = String.fromCharCode(0x2014);
  for (const text of words) expect(text.includes(emDash)).toBe(false);
});
