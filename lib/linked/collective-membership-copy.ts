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
