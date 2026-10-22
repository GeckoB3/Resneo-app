import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import * as WebBrowser from 'expo-web-browser';

import {
  subscribePendingPushRoute,
  takePendingPushRoute,
  type PendingPushRoute,
} from '@/lib/push/pendingNotificationRoute';
import { switchSiteForPush } from '@/lib/sites/push-site';

/** The site a push names, for the kinds that open at one site. */
function pushVenueId(route: PendingPushRoute): string | null {
  switch (route.kind) {
    case 'booking':
    case 'posCollect':
    case 'posTill':
    case 'posOrder':
    case 'posOrders':
      return route.venueId ?? null;
    default:
      return null;
  }
}

/**
 * Routes a parked notification tap to its booking — from INSIDE the navigator.
 *
 * Renders nothing. It must stay mounted within the (app) `<Stack>`: being there
 * is the guarantee that a navigator exists to receive the push. See
 * lib/push/pendingNotificationRoute.ts for why PushNotificationsProvider is not
 * allowed to navigate itself.
 *
 * Handles both arrival orders — a tap that LAUNCHED the app is parked long
 * before this mounts (drained on mount), and a tap taken while the app is
 * running arrives after (drained via the subscription).
 *
 * A push for another site switches there first (web roles plan §6.2c), then
 * clears the old site's screens and opens it: the booking, and the till and
 * shop screens, which otherwise only say the item belongs to another venue. A
 * push that names no site, or the current one, opens straight away as before.
 */
export function PendingPushRouteHandler(): null {
  const router = useRouter();

  useEffect(() => {
    const open = (route: PendingPushRoute) => {
      if (route.kind === 'booking') {
        router.push(`/booking/${route.bookingId}` as Href);
        return;
      }

      if (route.kind === 'posCollect') {
        // Take a card payment sent from the web till (POS app step 2). The screen checks the
        // venue, the POS switch and the payment itself, so an old or foreign push is harmless.
        const venue = route.venueId ? `?venue=${encodeURIComponent(route.venueId)}` : '';
        router.push(`/checkout/collect/${route.paymentId}${venue}` as Href);
        return;
      }

      if (route.kind === 'posTill') {
        // The cash-up reminder (POS app step 3) opens the till, where the session can be closed.
        const query = new URLSearchParams();
        if (route.sessionId) query.set('session', route.sessionId);
        if (route.venueId) query.set('venue', route.venueId);
        const qs = query.toString();
        router.push(`/checkout/till${qs ? `?${qs}` : ''}` as Href);
        return;
      }

      if (route.kind === 'posOrder' || route.kind === 'posOrders') {
        // A new online order (POS app step 5) opens the order; the screen checks the venue.
        const venue = route.venueId ? `?venue=${encodeURIComponent(route.venueId)}` : '';
        router.push((route.kind === 'posOrder' ? `/orders/${route.orderId}${venue}` : '/orders') as Href);
        return;
      }

      if (route.kind === 'url') {
        /*
          A waitlist offer opens the venue's public booking page, because that
          is where the offer can actually be ACCEPTED and this app has no
          native booking flow for a customer. An in-app browser rather than the
          system one: the offer expires, and sending somebody out to Chrome to
          come back afterwards is friction on the one notification with a
          deadline attached.

          Failure is swallowed. A browser that will not open is not worth
          crashing a tap over, and the customer still has the email.
        */
        void WebBrowser.openBrowserAsync(route.url).catch((error) => {
          console.warn('[push] could not open the offer link:', error);
        });
        return;
      }

      // An offer with no bookable link. Their own bookings is where the
      // waitlist entry shows that a place has come up.
      router.push('/bookings' as Href);
    };

    const flush = () => {
      // `take` clears as it reads, so this can never route the same tap twice.
      const route = takePendingPushRoute();
      if (!route) return;

      const venueId = pushVenueId(route);
      if (!venueId) {
        open(route);
        return;
      }
      void switchSiteForPush(venueId).then((switched) => {
        // The screens on the stack belong to the site just left.
        if (switched && router.canDismiss()) router.dismissAll();
        open(route);
      });
    };

    flush();
    return subscribePendingPushRoute(flush);
  }, [router]);

  return null;
}
