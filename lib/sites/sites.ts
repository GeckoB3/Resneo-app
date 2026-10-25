import { ROLE_LABELS } from '@/lib/roles/roles';
import type { MeSites, OverviewGroup, OverviewSite } from '@/types/sites';

/**
 * Words and decisions for the site picker and the All sites screen (web roles plan §6.2c, §6.3,
 * §6.7; copy from Appendix C "Sites"). Pure: no request, no React.
 */

export const SITES_COPY = {
  chooseSite: 'You work at more than one business. Choose where to go. You can switch any time from the menu.',
  switchSite: 'Switch site',
  allSites: 'All sites',
  addSiteInApp: 'Add a site from your ResNeo dashboard on the web.',
  currentSite: 'Current site',
  invite: (site: string) => `${site} has invited you to join their team.`,
  join: 'Join',
  decline: 'Decline',
  declineConfirm: "Decline? They'll need to invite you again.",
  keepInvite: 'Keep it',
  joined: (site: string) => `You've joined ${site}. Switch sites from the menu.`,
  ownerInvite: 'This business is waiting for you as its owner. Contact ResNeo support.',
  ownPasswordFirst: (site: string) =>
    `Before you join another business, choose your own password. Your current one was set by ${site}.`,
  choosePassword: 'Choose a password',
  lostAccess: 'You no longer have access to that site.',
  loadFailed: "We couldn't load your sites. Please try again.",
  joinFailed: 'We could not join that business. Please try again.',
  declineFailed: 'We could not decline that invitation. Please try again.',
  switchFailed: 'We could not switch site. Please try again.',
  // The overview (Appendix C "The overview").
  bookingsToday: 'Bookings today',
  nextBooking: 'Next booking',
  nextBookingNone: 'None',
  bookedThisWeek: 'Booked this week',
  newBookingsThisWeek: 'New bookings this week',
  sinceCancelled: (n: number) => `${n} since cancelled`,
  noShowsThisWeek: 'No-shows this week',
  netTakingsThisWeek: 'Net takings this week',
  total: 'Total',
  totalLeavesOut: (site: string) => `Total leaves out ${site}, which didn't load.`,
  takingsCovers: (n: number, m: number) => `Takings total covers ${n} of ${m} sites.`,
  firstSites: 'Figures shown for your first 20 sites.',
  subscriptionEnded: 'Subscription ended',
  siteFailed: "We couldn't load this site",
  overviewFailed: "We couldn't load your sites. Please try again.",
  switchAction: 'Switch',
  planAction: 'Plan',
} as const;

/** The role a site shows next to its name: "Owner", "Admin", "Front desk" or "Staff". */
export function siteRoleLabel(site: { role_key?: keyof typeof ROLE_LABELS | null; is_owner?: boolean }): string {
  if (site.is_owner) return ROLE_LABELS.owner;
  return ROLE_LABELS[site.role_key ?? 'staff'] ?? ROLE_LABELS.staff;
}

/**
 * Whether the More tab's header offers the site picker: someone with more than one site, an
 * invite waiting, or the overview. Anyone else sees no change (§6.7).
 */
export function showsSitePicker(me: MeSites | null | undefined): boolean {
  if (!me) return false;
  return (me.sites?.length ?? 0) > 1 || (me.pending_invites?.length ?? 0) > 0 || me.overview_eligible === true;
}

/** After sign-in, the picker is offered only for more than one site or an invite waiting (§6.2c). */
export function offersSitePickerAfterSignIn(me: MeSites | null | undefined): boolean {
  if (!me) return false;
  return (me.sites?.length ?? 0) > 1 || (me.pending_invites?.length ?? 0) > 0;
}

/**
 * A site's plan status in words, as the web's Sites page and All sites cards say it (web
 * `sitePlanStatusLabel` in src/lib/sites/sites-page.ts), so one site reads the same everywhere.
 */
export function planStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Free trial';
    case 'past_due':
      return 'Payment due';
    case 'cancelling':
      return 'Ending soon';
    case 'cancelled':
      return SITES_COPY.subscriptionEnded;
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : '';
  }
}

/** The notes under a group's total, as the web shows them. */
export function groupTotalNotes(group: OverviewGroup): string[] {
  const notes: string[] = [];
  for (const site of group.sites) {
    if (site.state === 'error') notes.push(SITES_COPY.totalLeavesOut(site.name));
  }
  if (group.sites.some((s) => s.state === 'not_loaded')) notes.push(SITES_COPY.firstSites);
  return notes;
}

/** How many sites in a group loaded figures in this currency: the "of {m}" in the takings note. */
export function sitesCountedIn(sites: OverviewSite[], currency: string): number {
  return sites.filter((s) => s.state === 'ok' && s.currency === currency).length;
}
