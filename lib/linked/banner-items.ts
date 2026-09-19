/**
 * The rows the linked-venue banner shows, from the incoming feed (web `LinkedAccountBanner.tsx`,
 * `bannerItemsFromFeed`; plan §4). Five kinds, each with its own destination in the app:
 * a request to review, a request of ours still waiting, a permission change to answer, a
 * collective the host still has to set up, and a collective whose host is setting it up.
 */
import { formatVenueList, setupCopy } from '@/lib/linked/setup-copy';
import type { IncomingLinksResponse } from '@/types/linked-venues';

export type BannerItemKind = 'request' | 'waiting' | 'change' | 'setup' | 'member-waiting';

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
      text: r.collective
        ? setupCopy('banner.requestWithCollective', { venue: r.otherVenueName, collective: r.collective.name })
        : setupCopy('banner.request', { venue: r.otherVenueName }),
      cta: setupCopy('banner.review.cta'),
      href: `/linked-venues?review=${encodeURIComponent(r.id)}`,
    })),
    ...(feed.outgoingRequests ?? []).map((r) => ({
      id: `waiting:${r.id}`,
      kind: 'waiting' as const,
      text: r.collective
        ? setupCopy('banner.waitingWithCollective', { venue: r.otherVenueName, collective: r.collective.name })
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
