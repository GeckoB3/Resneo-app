/**
 * Shared client lists: the one paragraph the Leave, Remove and End sheets gain (web
 * `client-sharing-lines.ts`; plan §1A.2 step 7, mockup board 7). No choices: every venue keeps every
 * client it holds. Null when there is nothing to say (the venue does not share, or an older server).
 */
import { clientSharingCopy, formatClientCount } from '@/lib/collective-area/client-sharing-copy';
import { formatVenueList } from '@/lib/collective-area/copy';
import type { ClientSharingStatusResponse, VenueClientSharingSummary } from '@/types/client-sharing';

/** The client-sharing rows of "What needs you" on Manage Collective (plan P7). */
export interface ClientSharingTodos {
  /** Another venue asked this one to share: its name. */
  askedBy: string | null;
  /** Cards waiting in Clients to check (owners and admins only); 0 shows no row. */
  toCheck: number;
}

/**
 * What the venue summary puts in "What needs you" for this collective: the request to share
 * (`cs.todo.asked`, Share now / Not now) and the clients to check (`cs.todo.check`, Check them).
 * Null when there is nothing, the summary is about another collective, or the server is older.
 */
export function clientSharingTodos(
  summary: VenueClientSharingSummary | undefined | null,
  collectiveId: string,
): ClientSharingTodos | null {
  if (!summary || summary.collectiveId !== collectiveId) return null;
  const askedBy = summary.request?.byVenueName || null;
  const toCheck = summary.canManage && summary.toCheck > 0 ? summary.toCheck : 0;
  if (!askedBy && toCheck === 0) return null;
  return { askedBy, toCheck };
}

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

/**
 * The host removing a venue: only when that venue's clients pass to another venue now (web review
 * 2026-11-15). Null on an older server that does not send `sharingVenueIds`.
 */
export function removeSharingLine(
  status: ClientSharingStatusResponse | undefined | null,
  venueId: string,
  venueName: string,
): string | null {
  if (status?.offered !== true || !Array.isArray(status.sharingVenueIds)) return null;
  if (!status.sharingVenueIds.includes(venueId)) return null;
  return clientSharingCopy('cs.leave.remove', { venue: venueName });
}

/**
 * Ending the collective: only when some venue's clients pass to another venue now. Null on an older
 * server that does not send `sharingVenueIds`.
 */
export function endSharingLine(status: ClientSharingStatusResponse | undefined | null): string | null {
  if (status?.offered !== true || !Array.isArray(status.sharingVenueIds)) return null;
  if (status.sharingVenueIds.length === 0) return null;
  return clientSharingCopy('cs.leave.end');
}
