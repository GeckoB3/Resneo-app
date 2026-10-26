/**
 * What the settings screens say while a venue is live in a collective (web
 * Docs/collective-booking-settings-plan.md §7 and §11, copy ids `cbs.*`, kept word for word with
 * `src/lib/linked-accounts/collective-copy.ts`). The collective decides sign-in, self-reschedule,
 * the waitlist, "Any available" and the staff-first order for every venue in it; the host edits
 * them, members see them read-only; each venue keeps its own payments, hours and messages.
 */

/** The collective block on GET/PATCH /api/venue/feature-flags (web §8). */
export interface FeatureFlagsCollective {
  id: string;
  /** The collective's own name (staff surfaces). */
  name: string;
  /** The name guests see on its page. */
  public_name: string;
  host_venue_name: string;
  is_host: boolean;
  /** The settings it decides: the `feature_flags` keys plus `require_account_login`. */
  controls: string[];
  version: number;
}

export type CollectiveSettingsParams = { collective: string; page: string; host: string };

export function collectiveSettingsParams(c: FeatureFlagsCollective): CollectiveSettingsParams {
  return { collective: c.name, page: c.public_name, host: c.host_venue_name };
}

export const collectiveSettingsCopy = {
  hostBanner: (p: CollectiveSettingsParams) =>
    `You host ${p.collective}. Settings marked ${p.collective} apply to the ${p.collective} page and to online bookings at every venue in it.`,
  memberBanner: (p: CollectiveSettingsParams) =>
    `You're part of ${p.collective}, hosted by ${p.host}. Your clients book on the ${p.collective} page. ${p.host} sets the settings marked ${p.collective}.`,
  savedForCollective: (p: CollectiveSettingsParams) => `Saved for ${p.collective}.`,
  setByHost: (p: CollectiveSettingsParams) => `${p.host} sets this for ${p.collective}.`,
  ownKept: (p: CollectiveSettingsParams) =>
    `Your venue's own settings are kept and apply again if you leave ${p.collective}.`,
  perVenuePayments: (p: CollectiveSettingsParams) =>
    `Your venue's own setting. It applies to payments for bookings with your calendars, including on the ${p.collective} page.`,
  perVenueMessages: (p: CollectiveSettingsParams) =>
    `Your venue's own messages. They go to clients booked with your calendars, including on the ${p.collective} page.`,
  perVenueSms: (p: CollectiveSettingsParams) =>
    `Text messages depend on your own plan, including for bookings made on the ${p.collective} page.`,
  perVenueHours: (p: CollectiveSettingsParams) =>
    `Your hours decide when your calendars can be booked, including on the ${p.collective} page.`,
  hostHours: (p: CollectiveSettingsParams) =>
    `Also shown on the ${p.collective} page, for guests. Each venue's own hours decide when its calendars can be booked.`,
  hostProfile: (p: CollectiveSettingsParams) =>
    `Your address, phone number and website are also shown on the ${p.collective} page.`,
  appointmentsLocked: (venue: string) =>
    `You cannot switch appointments off while ${venue} is in a collective, because the collective page needs them.`,
  timezoneLocked: (p: CollectiveSettingsParams) =>
    `You cannot change your timezone while you are part of ${p.collective}, because every venue in it uses the same timezone.`,
  ownHandedOver: (p: CollectiveSettingsParams) =>
    `Guests who open your own page are taken to the ${p.collective} page, so they don't see these settings. One thing here still shows there: your people's photos and a few words about them, under Meet the team. Everything else is kept for if you leave ${p.collective}.`,
  ownPartial: (p: CollectiveSettingsParams & { list: string }) =>
    `Your own page still shows ${p.list}. Everything else is on the ${p.collective} page. Your people's photos and a few words about them, under Meet the team, show there too.`,
  yourPeopleTitle: 'Your people on the page',
  yourPeopleBody: (collective: string) =>
    `Each of your people shows on the ${collective} page with the photo and the few words you gave them under Meet the team on your own page's settings.`,
  linkCollective: (p: CollectiveSettingsParams & { person: string }) =>
    `While you're in ${p.collective}, share this link. It opens the ${p.collective} page with ${p.person} already chosen. The older link still works.`,
};

/** The own page's status line (web `bp.status.*`, `bp.reason.*`), word for word. */
export function ownPageStatusLine(
  ownPage: { status: 'handing_over' | 'partial' | 'showing'; reason: string | null },
  names: { collective: string; host: string },
): string {
  if (ownPage.status !== 'showing') {
    return `Guests who visit your own booking page are sent to the ${names.collective} page.`;
  }
  const reasons: Record<string, string> = {
    notLive: `the ${names.collective} page is not live yet`,
    noCalendars: `none of your calendars offer a service on the ${names.collective} page yet`,
    paused: `booking is paused on the ${names.collective} page`,
    settingUp: `your services from ${names.host} are still being set up`,
  };
  const reason = reasons[ownPage.reason ?? ''] ?? `the ${names.collective} page is unavailable right now`;
  return `Your own page is showing because ${reason}.`;
}

/** The feature-flags keys the collective decides, as the booking settings screen shows them. */
export const COLLECTIVE_FLAG_ROWS: ReadonlySet<string> = new Set([
  'any_available_practitioner',
  'staff_first_booking_flow',
  'guest_self_reschedule',
  'waitlist_v2',
]);
