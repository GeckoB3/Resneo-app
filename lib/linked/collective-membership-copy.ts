/**
 * Words for joining and leaving a venue collective (web W7/W10, 2026-09).
 *
 * On shared services (`serviceModel === 'replicas'`) a member's own booking page sends guests to the
 * collective page while it is live (web D3), and joining needs the consent dialog, which only the
 * web shows: the one-tap accept answers 409 `COLLECTIVE_CONSENT_REQUIRED`.
 */
import { apiErrorCode } from '@/lib/api/client';

export const CONSENT_REQUIRED_CODE = 'COLLECTIVE_CONSENT_REQUIRED';

export function isConsentRequired(error: unknown): boolean {
  return apiErrorCode(error) === CONSENT_REQUIRED_CODE;
}

/** The web page where an invitation is accepted with its consent. */
export const COLLECTIVE_JOIN_WEB_PATH = '/dashboard/settings?tab=linked-accounts';

/** The web's Collective area: the services grid, venues and history (shared services). */
export const COLLECTIVE_AREA_WEB_PATH = '/dashboard/collective';

/** "2 active members · Light 3, Plus 1 Staging", with no trailing dot when nobody is left. */
export function collectiveMembersLine(collective: {
  activeMemberCount: number;
  members: readonly { venueName: string }[];
}): string {
  const count = `${collective.activeMemberCount} active ${collective.activeMemberCount === 1 ? 'member' : 'members'}`;
  const names = collective.members.map((m) => m.venueName).filter(Boolean).join(', ');
  return names ? `${count} · ${names}` : count;
}

export function joinOnWebCopy(collectiveName: string): { title: string; message: string; confirmLabel: string } {
  return {
    title: 'Open ResNeo on the web to join',
    message:
      `Joining ${collectiveName} means agreeing to how shared services, your booking page and your ` +
      'clients work in a collective. That step is on the web: open Settings, then Linked Accounts, ' +
      'and accept the invitation there.',
    confirmLabel: 'Open ResNeo on the web',
  };
}

export function isSharedServices(collective: { serviceModel?: string | null }): boolean {
  return collective.serviceModel === 'replicas';
}

/** The host's note under "Settings that follow the host venue". */
export function hostSettingsNote(collective: { serviceModel?: string | null }, hostName: string): string {
  return isSharedServices(collective)
    ? `The services on the page, with their prices, lengths, deposits, options, add-ons and forms, are ${hostName}'s, and apply at every venue. Guests are asked to sign in only when ${hostName} asks for it. Each booking, its payment and the client record belong to the venue the guest books with.`
    : 'Prices, durations, deposits and cancellation notice come from each member venue\u2019s own service, because every booking is made with that venue. If any member requires customers to sign in to book, the combined page asks them to sign in too.';
}

/** What a member reads at the top of its combined-page summary. */
export function memberSummaryIntro(collective: { name: string; serviceModel?: string | null }, hostName: string): string {
  return isSharedServices(collective)
    ? `${hostName} hosts ${collective.name} and manages its booking page and the services on it, with their prices, lengths, deposits, options and forms, for every venue. You choose which of your calendars offer each one on your Services screen, and your own hours and closures decide when they are free.`
    : `${hostName} hosts ${collective.name} and manages its combined booking page: the services on it, which calendars are offered, its headings, photos and branding. Your services appear there with the price, length and availability set under your own Services settings.`;
}

/** Shared services: where the page's services and calendars are managed now. */
export const SHARED_SERVICES_POINTER =
  'On shared services, the services on the page are the ones marked Collective on your Services screen, and the calendars at every venue that offer them are chosen on ResNeo on the web, in the Collective area. Each venue chooses its own calendars on its Services screen.';

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
