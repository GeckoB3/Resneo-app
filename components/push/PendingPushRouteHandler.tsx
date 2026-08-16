import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import {
  subscribePendingBookingRoute,
  takePendingBookingRoute,
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
      const bookingId = takePendingBookingRoute();
      if (!bookingId) return;
      router.push(`/booking/${bookingId}` as Href);
    };

    flush();
    return subscribePendingBookingRoute(flush);
  }, [router]);

  return null;
}
