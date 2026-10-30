/**
 * Links that hold a collective together (CQ-01; web `collective-link-break.ts` and
 * `CollectiveBreakWarning.tsx`, 2026-10-29). Pure, so the rules are tested without rendering.
 *
 * Every venue in a collective works with every other, so each pair needs a link at full access both
 * ways: full calendar detail and create, edit and cancel, with no calendar limits. When a change takes
 * a link below that, one venue leaves the collective: never the host, and between two members the one
 * that made the change. The server works out who (`GET /api/venue/account-links` `collectiveHolds`),
 * refuses Unlink, Reduce access and Accept change with 409 `LINK_HOLDS_COLLECTIVE` unless the request
 * says the venue was shown that plan, and the app shows it before anything is confirmed.
 */
import { ApiError, isApiErrorBody } from '@/lib/api/client';
import { normaliseGrant } from '@/lib/linked/grants';
import { formatVenueList, setupCopy, type SetupCopyId } from '@/lib/linked/setup-copy';
import type {
  CollectiveBreakAcknowledgement,
  LinkBreakPlan,
  LinkCollectiveBreak,
  LinkCollectiveHold,
  LinkGrant,
} from '@/types/linked-venues';

/** The code the link routes answer when a change would take a venue out of a collective. */
export const LINK_HOLDS_COLLECTIVE = 'LINK_HOLDS_COLLECTIVE';

export type LinkBreakAction = 'unlink' | 'reduce' | 'accept';

function grantHolds(grant: LinkGrant): boolean {
  const g = normaliseGrant(grant);
  return g.calendar === 'full_details' && g.act === 'create_edit_cancel' && (g.calendarIds ?? null) === null;
}

/** Both directions at full access with no calendar limits: the link still holds a collective. */
export function grantsHoldCollective(iCan: LinkGrant, theyCan: LinkGrant): boolean {
  return grantHolds(iCan) && grantHolds(theyCan);
}

/** The "I have seen this" the app sends once it has shown `plan`. */
export function acknowledgementFor(collectiveId: string, plan: LinkBreakPlan): CollectiveBreakAcknowledgement {
  return { collective_id: collectiveId, leaving: plan.leaving.map((v) => v.venueId), outcome: plan.outcome };
}

/** A hold's plan for one side making the change, in the shape a 409 carries. */
export function breakFromHold(hold: LinkCollectiveHold, which: 'ifIChange' | 'ifTheyChange'): LinkCollectiveBreak {
  return {
    collectiveId: hold.collectiveId,
    collectiveName: hold.collectiveName,
    hostVenueId: hold.hostVenueId,
    hostName: hold.hostName,
    iAmHost: hold.iAmHost,
    otherIsHost: hold.otherIsHost,
    plan: hold[which],
  };
}

/** The plan a 409 `LINK_HOLDS_COLLECTIVE` carries, or null for any other answer. */
export function linkBreakFromResponse(body: unknown): LinkCollectiveBreak | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { code?: unknown; collectiveBreak?: unknown };
  if (b.code !== LINK_HOLDS_COLLECTIVE || !b.collectiveBreak || typeof b.collectiveBreak !== 'object') return null;
  const info = b.collectiveBreak as LinkCollectiveBreak;
  return info.plan && Array.isArray(info.plan.leaving) && Array.isArray(info.plan.remaining) ? info : null;
}

/**
 * A failed link request read for the collective: the plan to show, and the server's sentence (which
 * says the plan moved when an acknowledgement was sent). Null for any other failure.
 */
export function linkBreakFromError(error: unknown): { info: LinkCollectiveBreak; message: string | null } | null {
  if (!(error instanceof ApiError)) return null;
  const info = linkBreakFromResponse(error.body);
  if (!info) return null;
  return { info, message: isApiErrorBody(error.body) ? error.message : null };
}

/** Which wording a plan needs, seen from `myVenueId`. */
export function linkBreakCase(plan: LinkBreakPlan, myVenueId: string): 'ends' | 'youLeave' | 'theyLeave' {
  if (plan.outcome === 'ends') return 'ends';
  return plan.leaving.some((v) => v.venueId === myVenueId) ? 'youLeave' : 'theyLeave';
}

/** The names of the venues that leave, other than the venue reading. */
export function othersLeaving(plan: LinkBreakPlan, myVenueId: string): string {
  return formatVenueList(plan.leaving.filter((v) => v.venueId !== myVenueId).map((v) => v.name));
}

/** The collective's name, typed: compared trimmed and in any case, as End the collective does. */
export function typedNameMatches(typed: string, collectiveName: string): boolean {
  return typed.trim().toLowerCase() === collectiveName.trim().toLowerCase();
}

/** The confirm button stays off until the collective's name is typed, when the collective would end. */
export function linkBreakNeedsName(info: Pick<LinkCollectiveBreak, 'plan'> | null): boolean {
  return info?.plan.outcome === 'ends';
}

/** The confirm button for a change that takes a venue out of the collective. */
export function linkBreakConfirmLabel(
  action: LinkBreakAction,
  info: Pick<LinkCollectiveBreak, 'collectiveName' | 'plan'>,
  myVenueId: string,
): string {
  const which = linkBreakCase(info.plan, myVenueId);
  return setupCopy(`linkBreak.confirm.${action}.${which}` as SetupCopyId, {
    collective: info.collectiveName,
    venue: othersLeaving(info.plan, myVenueId),
  });
}

/** The line on a link's screen that says it holds the collective together, and what changing it does. */
export function collectiveHoldLine(hold: LinkCollectiveHold, myVenueId: string): string {
  const which = linkBreakCase(hold.ifIChange, myVenueId);
  if (which === 'ends') return setupCopy('la.link.holds.ends', { collective: hold.collectiveName });
  if (which === 'youLeave') return setupCopy('la.link.holds.you', { collective: hold.collectiveName });
  return setupCopy('la.link.holds.them', {
    collective: hold.collectiveName,
    venue: othersLeaving(hold.ifIChange, myVenueId),
  });
}

/** The short line under a link in the list. */
export function collectiveHoldShort(hold: LinkCollectiveHold): string {
  return setupCopy('la.link.holds.short', { collective: hold.collectiveName });
}

/** The warning's lines, in order: who leaves, then what happens to the collective. */
export function linkBreakLines(info: LinkCollectiveBreak, myVenueId: string): string[] {
  const { plan, collectiveName: collective, hostName: host } = info;
  const lines = plan.leaving.map((v) =>
    v.venueId === myVenueId
      ? setupCopy('linkBreak.youLeave', { collective, host })
      : setupCopy('linkBreak.theyLeave', { venue: v.name, collective }),
  );
  lines.push(
    plan.outcome === 'ends'
      ? setupCopy('linkBreak.ends', { collective })
      : plan.outcome === 'waits'
        ? setupCopy('linkBreak.waits', { collective, venue: plan.remaining[0]?.name ?? host })
        : setupCopy('linkBreak.carriesOn', { collective, venueList: formatVenueList(plan.remaining.map((v) => v.name), 3) }),
  );
  return lines;
}

/** Whether the warning offers the narrower path: the host removes the other venue, a member leaves. */
export function linkBreakInstead(info: Pick<LinkCollectiveBreak, 'iAmHost' | 'otherIsHost'>): 'remove' | 'leave' | null {
  if (info.iAmHost && !info.otherIsHost) return 'remove';
  if (!info.iAmHost) return 'leave';
  return null;
}

/** The host's Remove takes only the other venue out: it ends the collective when that venue was the last. */
export function removalEnds(info: Pick<LinkCollectiveBreak, 'plan'>, otherVenueId: string): boolean {
  return info.plan.outcome === 'ends' && info.plan.leaving.length === 1 && info.plan.leaving[0]!.venueId === otherVenueId;
}
