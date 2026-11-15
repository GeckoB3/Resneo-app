/**
 * Shared client lists: the one paragraph the Leave, Remove and End sheets gain (web
 * `client-sharing-lines.ts`; plan §1A.2 step 7, mockup board 7). No choices: every venue keeps every
 * client it holds. Null when there is nothing to say (the venue does not share, or an older server).
 */
import { clientSharingCopy, formatClientCount } from '@/lib/collective-area/client-sharing-copy';
import { formatVenueList } from '@/lib/collective-area/copy';
import type { ClientSharingStatusResponse } from '@/types/client-sharing';

/** Leaving: what this venue keeps, and that the others keep what it shared. */
export function leaveSharingParagraph(status: ClientSharingStatusResponse | undefined | null): string | null {
  if (!status?.me || status.me.state !== 'on' || !status.counts || !Array.isArray(status.venues)) return null;
  const partners = status.venues.filter((v) => v.status === 'sharing' || v.status === 'paused').map((v) => v.name);
  const first = clientSharingCopy('cs.leave.paragraph', { count: formatClientCount(status.counts.shared) });
  if (partners.length === 0) return first;
  const others =
    partners.length === 1
      ? clientSharingCopy('cs.leave.othersKeepOne', { venue: partners[0] })
      : clientSharingCopy('cs.leave.othersKeep', { venues: formatVenueList(partners) });
  return `${first} ${others}`;
}

/** The host removing a venue. */
export function removeSharingLine(status: ClientSharingStatusResponse | undefined | null, venueName: string): string | null {
  if (status?.offered !== true) return null;
  return clientSharingCopy('cs.leave.remove', { venue: venueName });
}

/** Ending the collective. */
export function endSharingLine(status: ClientSharingStatusResponse | undefined | null): string | null {
  if (status?.offered !== true) return null;
  return clientSharingCopy('cs.leave.end');
}
