/**
 * Converts a web-dashboard notification href to a mobile expo-router route.
 *
 * Web paths:
 *   /dashboard/calendar?date=2026-06-11  →  { type: 'calendar' }      (calendar tab)
 *   /dashboard/settings?tab=linked-accounts  →  { type: 'linked-venues' }  (Linked Venues hub)
 *   /dashboard/appointment-services?add_from=…&service=…  →  { type: 'services' }  (Services; a
 *                                        member's suggestion, N25, opens "Add from another venue")
 *   /dashboard/settings?tab=commission[&…]  →  { type: 'commission-splits' }  (Commission splits;
 *                                        a `split=<id>` among the extra params opens that split)
 *   anything else                        →  null (no navigation)
 *
 * Linked-venue activity points at the web Settings → Linked Accounts page; the
 * app now has a native Linked Venues hub, so we route admins there. The caller
 * keeps non-admins on the feed (the hub is admin-only).
 */
export type NotificationRoute =
  | { type: 'calendar'; date: string }
  | { type: 'linked-venues' }
  | { type: 'services'; addFrom: string | null; service: string | null }
  | { type: 'commission-splits'; splitId: string | null }
  | null;

export function parseNotificationRoute(href: string | null | undefined): NotificationRoute {
  if (!href) return null;

  // Calendar date deep-link: /dashboard/calendar?date=YYYY-MM-DD
  const calendarMatch = href.match(/\/calendar\?date=(\d{4}-\d{2}-\d{2})/);
  if (calendarMatch) {
    return { type: 'calendar', date: calendarMatch[1] };
  }

  // Commission splits notices (2026-10-14: proposed, accepted, declined, ended, withdrawn, marked
  // paid, undone) → the app's Commission splits screen (admins; the caller keeps non-admins on the
  // feed), with whatever else the link carries.
  if (/\/dashboard\/settings(?:\?|$)/.test(href) && queryValue(href, 'tab') === 'commission') {
    return { type: 'commission-splits', splitId: queryValue(href, 'split') };
  }

  // Linked-venue activity → the native Linked Venues hub (admins; the caller
  // keeps non-admins on the feed).
  if (href.includes('linked-accounts') || href.includes('linked_accounts')) {
    return { type: 'linked-venues' };
  }

  // The Services page; a member's suggestion carries the venue and service to add (N25).
  if (/\/dashboard\/appointment-services(?:\?|$)/.test(href)) {
    return { type: 'services', addFrom: queryValue(href, 'add_from'), service: queryValue(href, 'service') };
  }

  return null;
}

/** One query value, decoded, or null. By hand: React Native's URLSearchParams has had no get(). */
function queryValue(href: string, name: string): string | null {
  const query = href.split('?')[1]?.split('#')[0] ?? '';
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key !== name || !value) continue;
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return null;
    }
  }
  return null;
}
