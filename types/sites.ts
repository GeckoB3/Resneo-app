import type { RoleKey } from '@/types/staff';

/**
 * One login, several sites (web roles plan Part B: Docs/user-roles-and-multi-site-plan.md §6.2c,
 * §6.3, §6.7, Appendix A "Sites"). The shapes the web's `src/lib/sites/me-sites.ts` and
 * `src/lib/sites/overview.ts` answer with.
 */

/** A site this login belongs to (`GET /api/v1/me/sites` → `sites[]`). */
export interface MeSite {
  venue_id: string;
  name: string;
  role: 'admin' | 'staff';
  role_key: RoleKey;
  is_owner: boolean;
  onboarding_complete: boolean;
}

/** A site waiting for this login to Join or Decline (`pending_invites[]`). */
export interface MePendingInvite {
  staff_id: string;
  venue_id: string;
  venue_name: string;
  role_key: RoleKey;
  /** The business waits for this person as its owner, so it cannot be declined. */
  is_owner?: boolean;
  invited_at: string | null;
}

/** `GET /api/v1/me/sites`. */
export interface MeSites {
  home_venue_id: string | null;
  /** The site this request acted on: the chosen one, or the home site without a header. */
  active_venue_id: string | null;
  sites: MeSite[];
  pending_invites: MePendingInvite[];
  /** Two or more sites where the person is owner or admin (§6.7). */
  overview_eligible: boolean;
}

export type OverviewSiteState = 'ok' | 'error' | 'not_loaded' | 'ended';

export interface OverviewToday {
  /** The site's own today, YYYY-MM-DD. */
  date: string;
  bookings: number;
  /** HH:MM on the site's clock, or null when nothing is left today. */
  next_booking_time: string | null;
}

export interface OverviewWeek {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Sunday, YYYY-MM-DD. */
  end: string;
  booked_pence: number;
  new_bookings: number;
  new_bookings_cancelled: number;
  no_shows: number;
  /** Null where the site's Takings tab does not show. */
  net_takings_pence: number | null;
}

export interface OverviewSite {
  venue_id: string;
  name: string;
  timezone: string;
  currency: string;
  role_key: RoleKey;
  is_owner: boolean;
  /** The owner, or an admin with "Billing, payouts and admins" on. */
  can_open_plan: boolean;
  state: OverviewSiteState;
  plan: { tier: string | null; status: string };
  today?: OverviewToday;
  week?: OverviewWeek;
}

export interface OverviewMoneyTotal {
  currency: string;
  booked_pence: number;
  net_takings_pence: number | null;
  /** How many counted sites in this currency gave a takings figure. */
  takings_sites: number;
}

export interface OverviewTotals {
  sites_counted: number;
  bookings_today: number;
  new_bookings: number;
  new_bookings_cancelled: number;
  no_shows: number;
  money: OverviewMoneyTotal[];
}

export interface OverviewGroup {
  /** "Your businesses" or "Owned by {owner}". */
  label: string;
  sites: OverviewSite[];
  totals: OverviewTotals | null;
}

/** `GET /api/venue/sites/overview`. */
export interface SitesOverview {
  eligible: boolean;
  groups: OverviewGroup[];
}
