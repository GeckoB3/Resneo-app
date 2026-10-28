/**
 * Inviting a venue into a collective, and the venues joining it, in the Collective area's words
 * (web `CollectiveInvitePanel`, `InvitedVenueStatus` and `CollectiveLinkTodos`, 2026-10-28).
 *
 * A venue joining works with every venue already in, so it needs a link with full access both ways
 * with each. One invitation covers all of it (owner, 2026-10-28): when the venue accepts, the
 * server links it with every venue in the collective and joins it, in one step. A request either
 * way is accepted at full access and a missing link is made. The one thing that holds a venue up is
 * a link already in force with less than full access (`not_full`), which somebody chose and which
 * joining never widens: only the venue on the other side of it can change it, in Linked venues.
 */
import { areaCopy, formatVenueList, type AreaCopyId } from '@/lib/collective-area/copy';
import type { InviteCheck, InviteeLinkTodo, LinkNeed, LinkNeedState } from '@/types/collectives';

/** What the host reads for its own link with the venue invited. */
const HOST_LINK_WORDS: Record<LinkNeedState, AreaCopyId> = {
  full: 'ov.venues.invite.link.full',
  their_request: 'ov.venues.invite.link.goesWith',
  my_request: 'ov.venues.invite.link.onJoin',
  none: 'ov.venues.invite.link.goesWith',
  not_full: 'ov.venues.invite.link.notFullYou',
};

/** What the host reads for a member's link with the venue invited. */
const MEMBER_LINK_WORDS: Record<LinkNeedState, AreaCopyId> = {
  full: 'ov.venues.invite.link.full',
  their_request: 'ov.venues.invite.link.onJoin',
  my_request: 'ov.venues.invite.link.onJoin',
  none: 'ov.venues.invite.link.onJoin',
  not_full: 'ov.venues.invite.link.notFull',
};

/** One checklist row's words; `need` is seen from the venue invited (web `inviteLinkWords`). */
export function inviteLinkWords(need: LinkNeed, invitee: string): string {
  const key = (need.is_host ? HOST_LINK_WORDS : MEMBER_LINK_WORDS)[need.state];
  return areaCopy(key, { venue: need.venue_name, invitee });
}

/** Whether the invitation can be sent: not already in or invited, and nothing in the way. */
export function inviteBlocked(check: InviteCheck): boolean {
  return check.standing.standing === 'blocked' || check.already !== null;
}

/** After sending: accepting links the venue with every venue here and joins, in one step. */
export function inviteSentMessage(check: InviteCheck): string {
  return areaCopy('ov.venues.invite.sent', { venue: check.venue.name });
}

/**
 * What an invited venue is waiting for: the venues whose link with it has less than full access
 * ("you" for the host), or, with nothing like that, the venue itself. Every other link is made as
 * it joins (web 2026-10-28).
 */
export function invitedVenueStatus(check: InviteCheck, venueName: string): string {
  const stillToLink = check.links.filter((l) => l.state === 'not_full');
  return stillToLink.length > 0
    ? areaCopy('ov.venues.invited.waitingLinks', {
        venues: formatVenueList(stillToLink.map((l) => (l.is_host ? areaCopy('ov.venues.invited.you') : l.venue_name))),
        venue: venueName,
      })
    : areaCopy('ov.venues.invited.waitingVenue', { venue: venueName });
}

/**
 * The "Venues joining" rows: only a link this venue has with the venue invited that is in force
 * with less than full access. Every other state is a link the join makes itself (web 2026-10-28).
 */
export function actionableLinkTodos(todos: readonly InviteeLinkTodo[] | undefined): InviteeLinkTodo[] {
  return (todos ?? []).filter((t) => t.state === 'not_full');
}

export function linkTodoText(todo: InviteeLinkTodo): string {
  return areaCopy('ov.linkTodo.notFull', { venue: todo.venue_name, collective: todo.collective_name });
}
