/**
 * The venue's links with every venue in a collective it is joining, in the join and review sheets'
 * words (web `JoinLinksChecklist` and `joinLinkNames` in JoinCollectiveDialog.tsx, 2026-10-28).
 * Pure, so the rules are tested without rendering.
 *
 * Joining makes every link the venue needs in the same step as the join (web
 * `collective-join-links.ts`): a request either way is accepted at full access both ways, and a
 * missing link is made. The app accepts nothing itself. The one exception is a link already in
 * force with less than full access (or suspended), which somebody chose: joining never widens it,
 * so it is changed in Linked venues first.
 */
import { formatVenueList, setupCopy, type SetupCopyId } from '@/lib/linked/setup-copy';
import type { LinkNeed, LinkNeedState } from '@/types/collectives';

const LINK_STATE_WORDS: Record<LinkNeedState, SetupCopyId> = {
  full: 'join.links.state.full',
  their_request: 'join.links.state.onJoin',
  my_request: 'join.links.state.onJoin',
  none: 'join.links.state.onJoin',
  not_full: 'join.links.state.not_full',
};

/** "Already linked", "Linked when you join", or the line for a link with less than full access. */
export function joinLinkStateWords(state: LinkNeedState): string {
  return setupCopy(LINK_STATE_WORDS[state]);
}

/**
 * The checklist's rows: every link but the request under review alongside, which that sheet
 * describes itself. Empty when there is nothing to show, or when every link is already there.
 */
export function checklistLinks(links: readonly LinkNeed[] | undefined, exceptLinkId?: string): LinkNeed[] {
  const shown = (links ?? []).filter((l) => !exceptLinkId || l.link_id !== exceptLinkId);
  return shown.every((l) => l.state === 'full') ? [] : shown;
}

/**
 * The venues joining links this one with, for the check step's line, or null: every link not there
 * yet but one with less than full access, never the request under review.
 */
export function joinLinkNames(links: readonly LinkNeed[] | undefined, exceptLinkId?: string): string | null {
  const names = (links ?? [])
    .filter((l) => l.state !== 'full' && l.state !== 'not_full' && (!exceptLinkId || l.link_id !== exceptLinkId))
    .map((l) => l.venue_name);
  return names.length > 0 ? formatVenueList(names) : null;
}
