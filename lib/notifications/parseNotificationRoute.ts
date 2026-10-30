/**
 * Converts a web-dashboard notification href to a mobile expo-router route.
 *
 * Web paths:
 *   /dashboard/calendar?date=2026-06-11  →  { type: 'calendar' }      (calendar tab)
 *   /dashboard/settings?tab=linked-accounts  →  { type: 'linked-venues' }  (Linked Venues hub)
 *   /dashboard/appointment-services?add_from=…&service=…  →  { type: 'services' }  (Services; a
 *                                        member's suggestion, N25, in a bell stored before
 *                                        2026-10-27. Services sends a host on to Manage
 *                                        Collective's every-venue view, or, on a server without
 *                                        it, opens "Add from another venue" as before)
 *   /dashboard/collective[?view=venues&venue=…&filter=suggested]  →  { type: 'collective-area' }
 *                                        (Manage Collective; a bell about curating the page or a
 *                                        member's suggestions opens every venue's services on that
 *                                        venue and filter, 2026-10-27)
 *   /dashboard/settings?tab=commission[&…]  →  { type: 'commission-splits' }  (Commission splits;
 *                                        a `split=<id>` among the extra params opens that split)
 *   /dashboard/availability              →  { type: 'availability' }  (Calendar Availability; a
 *                                        collective calendar notice)
 *   /dashboard/settings?tab=booking-page →  { type: 'booking-page' }  (the address question, N38)
 *   anything else                        →  null (no navigation)
 *
 * Collective notices (CQ-10.5, 2026-10-29) open the screen that answers them, by their `type`: the
 * server's read-time fallback writes `/dashboard/collective`, `/dashboard/appointment-services` or
 * `settings?tab=booking-page` into a notice stored without a link, and an invitation
 * (`collective_n1`, `collective_member_invited`) opens Venue collectives. An older server sends
 * those notices with the Linked Accounts link, so the app routes them by type itself, the same way
 * (`COLLECTIVE_NOTICE_ROUTES`, the server's table). A link that ended (`collective_link_ended`)
 * opens Services: an older server cannot say whether this venue is the one that left, and the venue
 * that left must not be sent to Manage Collective.
 *
 * Linked-venue activity points at the web Settings → Linked Accounts page; the
 * app now has a native Linked Venues hub, so we route admins there. The caller
 * keeps non-admins on the feed (the hub is admin-only).
 */
export type NotificationRoute =
  | { type: 'calendar'; date: string }
  | { type: 'linked-venues' }
  | { type: 'services'; addFrom: string | null; service: string | null }
  | {
      type: 'collective-area';
      /** 'venues' opens the host's Services tab on every venue's services. */
      view: 'venues' | null;
      venue: string | null;
      filter: 'suggested' | null;
    }
  | { type: 'commission-splits'; splitId: string | null }
  | { type: 'availability' }
  | { type: 'booking-page' }
  | { type: 'collectives' }
  | null;

/** Invitations to a collective: answered on Venue collectives. */
const COLLECTIVE_INVITATION_TYPES = new Set(['collective_n1', 'collective_member_invited']);

/**
 * Where a collective notice opens when an older server sent it with the Linked Accounts link (web
 * `COLLECTIVE_NOTICE_HREFS` in `notification-center.ts`, 2026-10-29).
 */
const COLLECTIVE_NOTICE_ROUTES: Record<string, 'collective' | 'services' | 'booking-page'> = {
  collective_service_offered: 'collective',
  collective_joined: 'collective',
  collective_commercial_change: 'collective',
  collective_digest: 'collective',
  collective_values_cleared: 'collective',
  collective_link_failed: 'collective',
  collective_host_transfer: 'collective',
  collective_n26: 'collective',
  collective_n35: 'collective',
  collective_n37: 'collective',
  collective_left: 'collective',
  collective_n25: 'collective',
  collective_suggestion: 'collective',
  collective_n38: 'booking-page',
  collective_n19: 'services',
  collective_removed: 'services',
  collective_link_ended: 'services',
};

const MANAGE_COLLECTIVE: NotificationRoute = { type: 'collective-area', view: null, venue: null, filter: null };

/** A collective notice routed by its type, or null when the type says nothing. */
function collectiveRouteByType(type: string): NotificationRoute {
  if (COLLECTIVE_INVITATION_TYPES.has(type)) return { type: 'collectives' };
  const to = COLLECTIVE_NOTICE_ROUTES[type];
  if (to === 'collective') return MANAGE_COLLECTIVE;
  if (to === 'services') return { type: 'services', addFrom: null, service: null };
  if (to === 'booking-page') return { type: 'booking-page' };
  return null;
}

export function parseNotificationRoute(href: string | null | undefined, type?: string | null): NotificationRoute {
  // An invitation opens Venue collectives, whatever link it carries (the server keeps Linked
  // Accounts for it, which is where the web answers it).
  if (type && COLLECTIVE_INVITATION_TYPES.has(type)) return { type: 'collectives' };
  if (!href) return type ? collectiveRouteByType(type) : null;

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

  // The address question (N38): the venue's Booking page settings.
  if (/\/dashboard\/settings(?:\?|$)/.test(href) && queryValue(href, 'tab') === 'booking-page') {
    return { type: 'booking-page' };
  }

  // Linked-venue activity → the native Linked Venues hub (admins; the caller
  // keeps non-admins on the feed). A collective notice from an older server carries this link too:
  // it opens the screen its type names instead.
  if (href.includes('linked-accounts') || href.includes('linked_accounts')) {
    return (type ? collectiveRouteByType(type) : null) ?? { type: 'linked-venues' };
  }

  // A collective calendar notice: Calendar Availability.
  if (/\/dashboard\/availability(?:[?#/]|$)/.test(href)) {
    return { type: 'availability' };
  }

  // Manage Collective (web `venueServicesHref`, 2026-10-27): curating the page, a member's
  // suggestions, a suggestion left off. `/dashboard/collective` exactly, not a longer path.
  if (/\/dashboard\/collective(?:[?#]|$)/.test(href)) {
    return {
      type: 'collective-area',
      view: queryValue(href, 'view') === 'venues' ? 'venues' : null,
      venue: queryValue(href, 'venue'),
      filter: queryValue(href, 'filter') === 'suggested' ? 'suggested' : null,
    };
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
