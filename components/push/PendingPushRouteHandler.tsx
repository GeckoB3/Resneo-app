import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import * as WebBrowser from 'expo-web-browser';

import {
  subscribePendingPushRoute,
  takePendingPushRoute,
} from '@/lib/push/pendingNotificationRoute';

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
 */
export function PendingPushRouteHandler(): null {
  const router = useRouter();

  useEffect(() => {
    const flush = () => {
      // `take` clears as it reads, so this can never route the same tap twice.
      const route = takePendingPushRoute();
      if (!route) return;

      if (route.kind === 'booking') {
        router.push(`/booking/${route.bookingId}` as Href);
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

    flush();
    return subscribePendingPushRoute(flush);
  }, [router]);

  return null;
}
