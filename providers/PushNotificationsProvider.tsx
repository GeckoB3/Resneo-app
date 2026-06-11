import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { isBackendConfigured } from '@/lib/env';
import { Notifications } from '@/lib/push/notificationsModule';
import { isExpoGoClient } from '@/lib/push/runtime';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { useAuth } from '@/providers/AuthProvider';

type PushNotificationsProviderProps = {
  children: ReactNode;
};

function extractBookingId(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const candidates = [
    data['booking_id'],
    data['bookingId'],
    (data['booking'] as Record<string, unknown> | undefined)?.['id'],
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Registers the device for push notifications once a Supabase session is available, and
 * routes notification taps to the matching booking detail screen.
 *
 * Skips all expo-notifications imports in Expo Go — remote push requires a development build.
 */
export function PushNotificationsProvider({ children }: PushNotificationsProviderProps) {
  const router = useRouter();
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const registeredForTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      registeredForTokenRef.current = null;
      return;
    }
    if (!isBackendConfigured() || isExpoGoClient()) {
      return;
    }
    if (registeredForTokenRef.current === accessToken) {
      return;
    }
    registeredForTokenRef.current = accessToken;

    void registerCurrentDeviceForPush({ accessToken })
      .then((result) => {
        if (!result.registered && result.reason) {
          console.info('[push] not registered:', result.reason);
        }
      })
      .catch((error) => {
        // Push registration is best-effort — never let it take the app down.
        console.warn('[push] device registration failed:', error);
      });
  }, [accessToken]);

  useEffect(() => {
    if (isExpoGoClient()) {
      return;
    }

    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      try {
        // Statically bundled per-platform (null on web) — see notificationsModule.
        if (!Notifications) return;
        if (cancelled) return;

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as
            | Record<string, unknown>
            | null
            | undefined;
          const bookingId = extractBookingId(data);
          if (bookingId) {
            router.push(`/booking/${bookingId}` as Href);
          }
        });

        // Cold start: the tap that LAUNCHED the app isn't delivered to the
        // listener above — fetch it explicitly and route once.
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled && lastResponse) {
          const coldStartBookingId = extractBookingId(
            lastResponse.notification.request.content.data as Record<string, unknown> | null,
          );
          if (coldStartBookingId) {
            router.push(`/booking/${coldStartBookingId}` as Href);
          }
        }
      } catch (error) {
        console.warn('[push] notification listener setup failed:', error);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);

  return <>{children}</>;
}
