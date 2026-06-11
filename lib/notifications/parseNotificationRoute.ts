/**
 * Converts a web-dashboard notification href to a mobile expo-router route.
 *
 * Web paths:
 *   /dashboard/calendar?date=2026-06-11  →  /?date=2026-06-11  (calendar tab)
 *   /dashboard/settings/linked-accounts  →  /more/linked-accounts  (settings)
 *   anything else                        →  null (no navigation)
 */
export type NotificationRoute =
  | { type: 'calendar'; date: string }
  | { type: 'settings' }
  | null;

export function parseNotificationRoute(href: string | null | undefined): NotificationRoute {
  if (!href) return null;

  // Calendar date deep-link: /dashboard/calendar?date=YYYY-MM-DD
  const calendarMatch = href.match(/\/calendar\?date=(\d{4}-\d{2}-\d{2})/);
  if (calendarMatch) {
    return { type: 'calendar', date: calendarMatch[1] };
  }

  // Linked accounts settings page
  if (href.includes('linked-accounts') || href.includes('linked_accounts')) {
    return { type: 'settings' };
  }

  return null;
}
