/**
 * Words for joining and leaving a venue collective (web W7/W10, 2026-09).
 *
 * On shared services (`serviceModel === 'replicas'`) a member's own booking page sends guests to the
 * collective page while it is live (web D3), and joining needs the consent dialog, which only the
 * web shows: the one-tap accept answers 409 `COLLECTIVE_CONSENT_REQUIRED`.
 */
import { apiErrorCode } from '@/lib/api/client';
import { areaCopy } from '@/lib/collective-area/copy';

export const CONSENT_REQUIRED_CODE = 'COLLECTIVE_CONSENT_REQUIRED';

export function isConsentRequired(error: unknown): boolean {
  return apiErrorCode(error) === CONSENT_REQUIRED_CODE;
}

/**
 * "2 active members · Light 3 (you), Plus 1 Staging", with no trailing dot when nobody is left. Your
 * own venue reads "(you)", so it is never mistaken for a member of the same name, which the server
 * names with its town (CQ-07, web VenueCollectivesPanel).
 */
export function collectiveMembersLine(collective: {
  activeMemberCount: number;
  members: readonly { venueName: string; venueId?: string }[];
  myVenueId?: string;
}): string {
  const count = `${collective.activeMemberCount} active ${collective.activeMemberCount === 1 ? 'member' : 'members'}`;
  const names = collective.members
    .filter((m) => Boolean(m.venueName))
    .map((m) =>
      collective.myVenueId && m.venueId === collective.myVenueId ? areaCopy('svc.cal.venueYou', { venue: m.venueName }) : m.venueName,
    )
    .join(', ');
  return names ? `${count} · ${names}` : count;
}

export function isSharedServices(collective: { serviceModel?: string | null }): boolean {
  return collective.serviceModel === 'replicas';
}

/**
 * The last line of the collective's booking settings summary (web `CollectiveBookingSettingsSummary`):
 * whose services the page shows, and where each booking belongs. Sign-in is now the collective's own
 * setting, listed above it, so it is no longer described here.
 */
export function hostSettingsNote(collective: { serviceModel?: string | null }, hostName: string): string {
  return isSharedServices(collective)
    ? `The services on the page, with their prices, lengths, deposits, options, add-ons and forms, are ${hostName}'s, and apply at every venue. Each booking, its payment, its messages and the client record belong to the venue the guest books with.`
    : 'Prices, durations, deposits and cancellation notice come from each member venue\u2019s own service, because every booking is made with that venue.';
}

/** What a member reads at the top of its combined-page summary. */
export function memberSummaryIntro(collective: { name: string; serviceModel?: string | null }, hostName: string): string {
  return isSharedServices(collective)
    ? `${hostName} hosts ${collective.name} and manages its booking page and the services on it, with their prices, lengths, deposits, options and forms, for every venue. You and ${hostName} can each choose which of your calendars offer each one, in Manage Collective, and your own hours and closures decide when they are free.`
    : `${hostName} hosts ${collective.name} and manages its combined booking page: the services on it, which calendars are offered, its headings, photos and branding. Your services appear there with the price, length and availability set under your own Services settings.`;
}

export function leaveCollectiveMessage(collective: { name: string; serviceModel?: string | null }): string {
  if (collective.serviceModel === 'replicas') {
    return (
      `Your venue will be removed from "${collective.name}". You keep every service, calendar and booking, ` +
      `and the services from the host become yours to edit. Guests who visit your own booking page will ` +
      `book your own services there again.`
    );
  }
  return `Your venue will be removed from "${collective.name}". Your own booking page is unaffected.`;
}
