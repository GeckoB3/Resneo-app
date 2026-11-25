import type { AccountLinkView } from '@/types/linked-venues';

/** The bell screen's tabs (web booking-activity plan, BA2). */
export type NotificationTab = 'bookings' | 'linked';

export const NOTIFICATION_TAB_LABELS: Record<NotificationTab, string> = {
  bookings: 'Bookings',
  linked: 'Linked businesses',
};

/**
 * Whether this venue has anything to do with linked businesses, from what the app can see.
 *
 * The web shows its bell only for a venue with an accepted link (`venueHasAcceptedLink`), but no
 * route tells a non-admin that. So the tab shows when any of these holds:
 * - the linked-business feed has rows (or unread ones): there is something to read;
 * - the bell's own answer says the venue has an accepted link (`hasLinks`, web 2026-11-25), for
 *   every team member;
 * - for an admin on an older server, the venue has an accepted link (`/api/venue/account-links`).
 *   A collective is held together by accepted links, so this covers collectives too, and keeps the
 *   admin's email settings for linked businesses reachable before the first notice arrives.
 */
export function hasLinkedBusinessActivity(input: {
  notificationCount: number;
  unreadCount: number;
  hasLinks?: boolean | null;
  links: readonly Pick<AccountLinkView, 'status'>[] | null | undefined;
}): boolean {
  if (input.notificationCount > 0 || input.unreadCount > 0 || input.hasLinks === true) return true;
  return (input.links ?? []).some((link) => link.status === 'accepted');
}

/**
 * The tabs to show, in order. Bookings is first and the default; it goes when the server has no
 * booking activity route (an older web deploy). Linked businesses shows when the venue has linked
 * business activity, and always when Bookings is gone, so an older server keeps today's screen.
 * One tab means no tab bar.
 */
export function visibleNotificationTabs(input: {
  bookingsAvailable: boolean;
  hasLinked: boolean;
}): NotificationTab[] {
  const tabs: NotificationTab[] = [];
  if (input.bookingsAvailable) tabs.push('bookings');
  if (input.hasLinked || !input.bookingsAvailable) tabs.push('linked');
  return tabs;
}
