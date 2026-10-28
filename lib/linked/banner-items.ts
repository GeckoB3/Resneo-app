/**
 * The rows the linked-venue banner shows, from the incoming feed (web `LinkedAccountBanner.tsx`,
 * `bannerItemsFromFeed`; plan §4). Six kinds, each with its own destination in the app:
 * a request to review, a request of ours still waiting, a permission change to answer, a
 * collective the host still has to set up, a collective whose host is setting it up, and an
 * invitation from a host this venue is already linked with (2026-10-28), which no request carries
 * and which opens that collective's join sheet.
 */
import { formatVenueList, setupCopy } from '@/lib/linked/setup-copy';
import type { IncomingLinksResponse } from '@/types/linked-venues';

export type BannerItemKind = 'request' | 'waiting' | 'change' | 'setup' | 'member-waiting' | 'invitation';

export interface BannerItem {
  /** Stable across polls, so a dismissal holds: `${kind}:${id}`. */
  id: string;
  kind: BannerItemKind;
  text: string;
  cta: string;
  /** The app route the CTA opens. */
  href: string;
}

export function bannerItemsFromFeed(feed: Partial<IncomingLinksResponse> | null | undefined): BannerItem[] {
  if (!feed) return [];
  return [
    ...(feed.incomingRequests ?? []).map((r) => ({
      id: `request:${r.id}`,
      kind: 'request' as const,
      // A collective already running (`live`): the venue joins it, so nothing reads "start" (2026-10-28).
      text: r.collective
        ? setupCopy(r.collective.live ? 'banner.requestJoin' : 'banner.requestWithCollective', {
            venue: r.otherVenueName,
            collective: r.collective.name,
          })
        : setupCopy('banner.request', { venue: r.otherVenueName }),
      cta: setupCopy('banner.review.cta'),
      href: `/linked-venues?review=${encodeURIComponent(r.id)}`,
    })),
    ...(feed.outgoingRequests ?? []).map((r) => ({
      id: `waiting:${r.id}`,
      kind: 'waiting' as const,
      text: r.collective
        ? setupCopy(r.collective.live ? 'banner.waitingJoin' : 'banner.waitingWithCollective', {
            venue: r.otherVenueName,
            collective: r.collective.name,
          })
        : setupCopy('banner.waiting', { venue: r.otherVenueName }),
      cta: setupCopy('banner.waiting.cta'),
      href: '/linked-venues',
    })),
    ...(feed.pendingChanges ?? []).map((c) => ({
      id: `change:${c.id}`,
      kind: 'change' as const,
      text: setupCopy('banner.change', { venue: c.otherVenueName }),
      cta: setupCopy('banner.change.cta'),
      href: `/linked-venues/${encodeURIComponent(c.id)}`,
    })),
    ...(feed.collectiveSetup ?? []).map((s) => ({
      id: `setup:${s.collectiveId}`,
      kind: 'setup' as const,
      text: setupCopy('banner.setup', { venueList: formatVenueList(s.memberNames, 2) || 'Your partner venue', collective: s.name }),
      cta: setupCopy('banner.setup.cta'),
      href: `/collectives?setup=${encodeURIComponent(s.collectiveId)}`,
    })),
    ...(feed.memberWaiting ?? []).map((m) => ({
      id: `member-waiting:${m.collectiveId}`,
      kind: 'member-waiting' as const,
      text: setupCopy('banner.memberWaiting', { collective: m.name, host: m.hostName }),
      cta: setupCopy('banner.memberWaiting.cta'),
      href: '/collectives',
    })),
    // Accepting links the venue with every venue in the collective and joins, in one step.
    ...(feed.incomingInvitations ?? []).map((inv) => ({
      id: `invitation:${inv.collectiveId}`,
      kind: 'invitation' as const,
      text: setupCopy('banner.invitation', { host: inv.hostName, collective: inv.name }),
      cta: setupCopy('notify.invite.cta'),
      href: `/collectives?join=${encodeURIComponent(inv.collectiveId)}`,
    })),
  ];
}

/** How long a dismissal holds, as on the web. */
export const BANNER_DISMISS_MS = 24 * 60 * 60 * 1000;

/** Items not dismissed within the last 24 hours. */
export function filterVisibleBannerItems(
  items: readonly BannerItem[],
  dismissed: Record<string, number>,
  now = Date.now(),
): BannerItem[] {
  return items.filter((i) => {
    const at = dismissed[i.id];
    return !at || now - at > BANNER_DISMISS_MS;
  });
}
