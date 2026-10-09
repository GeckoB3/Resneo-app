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
  /*
    A sale sent from the web till to this phone (POS app step 2, plan §4.36):
    `{ type: 'pos_collect_request', payment_id, sale_id, venue_id }`. It has no
    booking id, so it is only ever examined after the booking check above. The
    collect screen reads the payment from the server, so only the id is kept.
  */
  if (data['type'] === 'pos_collect_request') {
    const paymentId = firstString([data['payment_id']]);
    if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
    return { kind: 'posCollect', paymentId, venueId: firstString([data['venue_id']]) };
  }

  /*
    The cash-up reminder (POS app step 3, plan §4.31 row 40): `{ type: 'pos_cash_up_reminder',
    till_session_id, till_id, venue_id }` for a till left open past the end of the day. It opens
    the till, where the session can be closed; the screen reads the tills from the server, so only
    the ids are kept.
  */
  if (data['type'] === 'pos_cash_up_reminder') {
    const sessionId = firstString([data['till_session_id']]);
    return {
      kind: 'posTill',
      sessionId: sessionId && /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : null,
      venueId: firstString([data['venue_id']]),
    };
  }

  /*
    Online orders (POS app step 5, plan Appendix G): `shop_order_new` (`{ type, sale_id, venue_id }`)
    opens the order. `shop_order_uncollected` and `shop_order_customer_here` (later passes) carry
    the same ids and open it too.
  */
  if (data['type'] === 'shop_order_new' || data['type'] === 'shop_order_uncollected' || data['type'] === 'shop_order_customer_here') {
    const orderId = firstString([data['sale_id'], data['order_id']]);
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return { kind: 'posOrders', venueId: firstString([data['venue_id']]) };
    return { kind: 'posOrder', orderId, venueId: firstString([data['venue_id']]) };
  }

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
