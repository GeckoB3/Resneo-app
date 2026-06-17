/**
 * Converts a web-dashboard notification href to a mobile expo-router route.
 *
 * Web paths:
 *   /dashboard/calendar?date=2026-06-11  →  { type: 'calendar' }      (calendar tab)
 *   /dashboard/settings?tab=linked-accounts  →  { type: 'linked-venues' }  (Linked Venues hub)
 *   anything else                        →  null (no navigation)
 *
 * Linked-venue activity points at the web Settings → Linked Accounts page; the
 * app now has a native Linked Venues hub, so we route admins there. The caller
 * keeps non-admins on the feed (the hub is admin-only).
 */
export type NotificationRoute =
  | { type: 'calendar'; date: string }
  | { type: 'linked-venues' }
  | null;

export function parseNotificationRoute(href: string | null | undefined): NotificationRoute {
  if (!href) return null;

  // Calendar date deep-link: /dashboard/calendar?date=YYYY-MM-DD
  const calendarMatch = href.match(/\/calendar\?date=(\d{4}-\d{2}-\d{2})/);
  if (calendarMatch) {
    return { type: 'calendar', date: calendarMatch[1] };
  }

  // Linked-venue activity → the native Linked Venues hub (admins; the caller
  // keeps non-admins on the feed).
  if (href.includes('linked-accounts') || href.includes('linked_accounts')) {
    return { type: 'linked-venues' };
  }

  return null;
}
