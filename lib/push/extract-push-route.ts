import type { PendingPushRoute } from '@/lib/push/pendingNotificationRoute';

/**
 * What a notification's payload wants opened.
 *
 * Lifted out of `PushNotificationsProvider` when the customer waitlist offer
 * arrived, because it is now a decision with branches rather than a field read,
 * and this way it can be tested without the native push stack.
 *
 * **Booking id first, unconditionally.** Reminders and booking changes carry
 * one and are the overwhelming majority; the staff app has relied on it since
 * long before any of this. Only a payload with no booking id is examined
 * further, so no existing notification changes behaviour.
 */
export function extractPushRoute(
  data: Record<string, unknown> | null | undefined,
): PendingPushRoute | null {
  if (!data) return null;

  const bookingId = firstString([
    data['booking_id'],
    data['bookingId'],
    (data['booking'] as Record<string, unknown> | undefined)?.['id'],
  ]);
  if (bookingId) return { kind: 'booking', bookingId };

  /*
    A waitlist offer PRECEDES any booking, so there is nothing to route to by
    id. The web sends `url`, the venue's public booking page, which is the same
    destination the offer email's button already points at. Fabricating a
    booking id to reuse the existing path would route the tap to a 404.
  */
  if (data['type'] === 'waitlist_offer') {
    const url = firstString([data['url']]);
    if (url && isSafeHttpsUrl(url)) return { kind: 'url', url };
    /*
      No url means the venue has no slug. `venue_id` is always present, but the
      app has no native booking screen to route it to, so the honest landing is
      the customer's own bookings, where the waitlist entry shows that a place
      has come up.
    */
    return { kind: 'customerHome' };
  }

  return null;
}

function firstString(candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/**
 * Only open an https URL on the ResNeo domain.
 *
 * A notification payload is attacker-controllable in the sense that matters:
 * anybody who can get a push delivered chooses this string. Opening it
 * unchecked would turn a notification into an open redirect inside the app,
 * and `javascript:` or a lookalike host is exactly what that invites. The
 * server only ever sends its own booking pages, so nothing legitimate is lost
 * by refusing everything else.
 */
function isSafeHttpsUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'resneo.com' || url.hostname.endsWith('.resneo.com');
  } catch {
    return false;
  }
}
