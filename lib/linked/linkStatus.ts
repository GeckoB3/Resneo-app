/** Display helpers for link status + termination reason (web `statusPill` parity). */

import type { LinkStatus, LinkTerminationReason } from '@/types/linked-venues';

export type LinkBadgeTone = 'neutral' | 'success' | 'warning';

/** Status pill label + Badge tone, matching the web Linked Accounts UI. */
export function linkStatusDisplay(status: LinkStatus): { label: string; tone: LinkBadgeTone } {
  switch (status) {
    case 'accepted':
      return { label: 'Active', tone: 'success' };
    case 'pending':
      return { label: 'Pending', tone: 'warning' };
    case 'suspended':
      return { label: 'Suspended', tone: 'warning' };
    case 'rejected':
      return { label: 'Declined', tone: 'neutral' };
    case 'revoked':
      return { label: 'Unlinked', tone: 'neutral' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/** Human label for why a past link ended. */
export function terminationReasonLabel(reason: LinkTerminationReason | null): string | null {
  switch (reason) {
    case 'unlinked':
      return 'Unlinked';
    case 'subscription_lapsed':
      return 'Subscription lapsed';
    case 'venue_deleted':
      return 'Venue deleted';
    case 'plan_ineligible':
      return 'Plan no longer eligible';
    case 'request_expired':
      return 'Request expired';
    default:
      return null;
  }
}

/**
 * A Past link's line in the list: "{reason} on {date}", from when it ended (CQ-07, A8-21: two links
 * with one venue read apart). Without a reason, "Ended {date}", as the link's own screen says.
 */
export function pastLinkLine(link: {
  terminationReason: LinkTerminationReason | null;
  terminatedAt: string | null;
  respondedAt: string | null;
}): string | undefined {
  const reason = terminationReasonLabel(link.terminationReason);
  const iso = link.terminatedAt ?? link.respondedAt;
  const d = iso ? new Date(iso) : null;
  const date =
    d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  if (reason && date) return `${reason} on ${date}`;
  if (date) return `Ended ${date}`;
  return reason ?? undefined;
}
