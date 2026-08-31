import { useEffect, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { isBackendConfigured } from '@/lib/env';
import { Notifications } from '@/lib/push/notificationsModule';
import { setPendingBookingRoute } from '@/lib/push/pendingNotificationRoute';
import { isExpoGoClient } from '@/lib/push/runtime';
import { registerCurrentDeviceForPush } from '@/lib/push/registerDevice';
import { audienceForRole, useRole } from '@/lib/queries/useRole';
import { useAuth } from '@/providers/AuthProvider';

type PushNotificationsProviderProps = {
  children: ReactNode;
};

/**
 * Notification category id used for actionable buttons (View / Confirm).
 * The SERVER must set this same id on the push payload so the OS renders the
 * action buttons:
 *   - Expo push: `{ "categoryIdentifier": "booking" }` (also `_category` legacy).
 *   - iOS APNs:  aps.category = "booking"; Android: channel + category metadata.
 */
const BOOKING_CATEGORY_ID = 'booking';

// Android notification channels. Android 8+ requires every notification to land
// on a channel; importance/sound/vibration are fixed per-channel at creation
// time (the user can later override them in system settings). The SERVER must
// set the matching `channelId` on the push payload for the notification to use
// the intended channel — otherwise it falls back to the default "Miscellaneous".
const ANDROID_CHANNELS = {
  bookingsNew: 'bookings-new',
  bookingsChanged: 'bookings-changed',
  reminders: 'reminders',
} as const;

/**
 * The CUSTOMER's channels, which are deliberately not the staff ones.
 *
 * These ids are a contract with the web sender
 * (`src/lib/communications/customer-push-notification.ts`), which sets them on
 * the payload; a mismatch means the notification lands on Android's fallback
 * "Miscellaneous" channel instead.
 *
 * Separate from the staff set because a channel is something the USER sees and
 * configures in system settings. `bookings-new` and its siblings are what a
 * venue's staff app means by those words, and a customer who muted "New
 * bookings" would not expect that to silence a reminder about their own
 * haircut.
 *
 * A dual-role person has both sets on one device, which is the point: they can
 * mute their venue's alerts overnight and still be reminded of their own
 * appointment.
 */
const CUSTOMER_ANDROID_CHANNELS = {
  reminders: 'customer-reminders',
  bookingChanges: 'customer-booking-changes',
  waitlist: 'customer-waitlist',
} as const;

/**
 * Create the Android notification channels. No-op off Android. Defensive:
 * setNotificationChannelAsync can reject on devices/permission states that do
 * not support channels, so failures are swallowed.
 */
async function configureAndroidChannels(notifications: NonNullable<typeof Notifications>): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { AndroidImportance, AndroidNotificationVisibility } = notifications;
  /**
   * `sound` is deliberately NOT set. On input it is a CUSTOM sound FILENAME that
   * must be bundled through the expo-notifications plugin's `sounds` array, so
   * passing the string 'default' made Android hunt for a file called "default"
   * and log on every launch:
   *
   *   expo-notifications: Custom sound 'default' not found in native app.
   *
   * Omitting it is what actually gives the system default notification sound at
   * these importance levels. (The value read back from a channel is
   * `'default' | 'custom' | null`, which describes the state rather than being
   * something to pass in — an easy trap.)
   */
  try {
    await notifications.setNotificationChannelAsync(ANDROID_CHANNELS.bookingsNew, {
      name: 'New bookings',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#003B6F',
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    await notifications.setNotificationChannelAsync(ANDROID_CHANNELS.bookingsChanged, {
      name: 'Booking changes',
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    await notifications.setNotificationChannelAsync(ANDROID_CHANNELS.reminders, {
      name: 'Reminders',
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });

    /*
      The customer's own channels, created for EVERYONE rather than only for
      customers.

      Channels are immutable once created, apart from name and description, and
      Android requires the channel to exist before a notification can use it.
      Creating them lazily when somebody switches to customer mode would mean
      the first customer notification after an upgrade had nowhere to land. They
      cost nothing when unused: a channel with no notifications is invisible in
      system settings until one arrives.
    */
    await notifications.setNotificationChannelAsync(CUSTOMER_ANDROID_CHANNELS.reminders, {
      name: 'Your booking reminders',
      importance: AndroidImportance.DEFAULT,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    await notifications.setNotificationChannelAsync(CUSTOMER_ANDROID_CHANNELS.bookingChanges, {
      name: 'Changes to your bookings',
      // HIGH, unlike the staff equivalent. A venue moving your appointment is
      // something you may need to act on today, and a customer sees far fewer
      // of these than a venue does.
      importance: AndroidImportance.HIGH,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    await notifications.setNotificationChannelAsync(CUSTOMER_ANDROID_CHANNELS.waitlist, {
      name: 'Waitlist offers',
      // HIGH because an offered place expires.
      importance: AndroidImportance.HIGH,
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
  } catch (error) {
    console.warn('[push] Android channel setup failed:', error);
  }
}

/**
 * Register the actionable "booking" category. Both buttons open the app (no
 * destructive actions) so the tap routes to the booking detail screen. Defensive:
 * swallow failures so an unsupported platform never breaks setup.
 */
async function configureNotificationCategories(
  notifications: NonNullable<typeof Notifications>,
): Promise<void> {
  try {
    await notifications.setNotificationCategoryAsync(BOOKING_CATEGORY_ID, [
      { identifier: 'VIEW', buttonTitle: 'View', options: { opensAppToForeground: true } },
      { identifier: 'CONFIRM', buttonTitle: 'Confirm', options: { opensAppToForeground: true } },
    ]);
  } catch (error) {
    console.warn('[push] notification category setup failed:', error);
  }
}

/** Clear the app-icon badge. Best-effort — unsupported platforms simply no-op. */
async function clearBadge(notifications: NonNullable<typeof Notifications>): Promise<void> {
  try {
    await notifications.setBadgeCountAsync(0);
  } catch (error) {
    console.warn('[push] clearing badge failed:', error);
  }
}

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
 * hands notification taps to the navigator to route.
 *
 * This provider deliberately does NOT navigate: it lives above the navigator, so
 * on a cold start its effects run before one exists. It parks the booking id via
 * `setPendingBookingRoute` and `PendingPushRouteHandler` (inside the (app)
 * Stack) does the routing — see lib/push/pendingNotificationRoute.ts for the
 * crash loop that taught us this.
 *
 * Skips all expo-notifications imports in Expo Go — remote push requires a development build.
 */
export function PushNotificationsProvider({ children }: PushNotificationsProviderProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  /*
    Which app this device belongs to, or null while we do not yet know.

    Before this, registration was gated on having a session and nothing else,
    and the payload carried no audience at all, so the server's `'staff'`
    default applied to everyone. A person who signed in, failed the staff check
    and landed on <StaffRequired/> was still silently registered as a staff
    device, and `sendStaffPush` fans out by `user_id` and audience, so that
    device received a venue's booking alerts. Those carry a client's name and
    service. It is live in production today and is the reason this phase exists.
  */
  const audience = audienceForRole(useRole());
  // Dedupe registration on the stable user id, NOT the access token — the token
  // rotates ~hourly via autoRefreshToken and would otherwise re-register the
  // device on every refresh.
  const registeredForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !accessToken) {
      registeredForUserRef.current = null;
      return;
    }
    if (!isBackendConfigured() || isExpoGoClient()) {
      return;
    }
    /*
      Wait for a resolved role rather than guessing one.

      This does mean a staff member whose staff/me check is failing for some
      reason OTHER than a 401 does not register on this pass. That is the right
      way round: the effect re-runs when the access token rotates, roughly
      hourly, so it self-heals, whereas a wrong audience persists in the
      database until the row is deleted and sends the wrong person somebody
      else's client details in the meantime.
    */
    if (!audience) {
      return;
    }
    if (registeredForUserRef.current === userId) {
      return;
    }
    // Latch in-flight so a re-render doesn't fire a second concurrent attempt —
    // but a FAILED attempt clears the latch below so it retries (the old code
    // latched before the async resolved, so a transient failure meant the device
    // never registered for the rest of the session).
    registeredForUserRef.current = userId;

    void registerCurrentDeviceForPush({ accessToken, audience })
      .then((result) => {
        if (!result.registered) {
          if (result.reason) console.info('[push] not registered:', result.reason);
          // Permanent non-registration (Expo Go / simulator / web / denied) stays
          // latched; a transient failure clears it so a later effect run (e.g. the
          // next ~hourly token refresh) retries.
          const retriable = result.reason === 'error' || result.reason === 'no-token';
          if (retriable && registeredForUserRef.current === userId) {
            registeredForUserRef.current = null;
          }
        }
      })
      .catch((error) => {
        // Push registration is best-effort — never let it take the app down. A
        // thrown error is transient (network), so clear the latch to retry later.
        console.warn('[push] device registration failed:', error);
        if (registeredForUserRef.current === userId) {
          registeredForUserRef.current = null;
        }
      });
  }, [userId, accessToken, audience]);

  useEffect(() => {
    if (isExpoGoClient()) {
      return;
    }

    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    // A notification was opened (tap or action button) — route to the booking
    // and clear the app-icon badge now that the user has seen it. CONFIRM is
    // treated as a routing-only action for now.
    // TODO: wire CONFIRM to a real booking-status mutation once this provider
    // has access to the booking-status hook + auth context (out of scope here).
    const handleResponse = (notifications: NonNullable<typeof Notifications>, response: unknown) => {
      const typed = response as {
        actionIdentifier?: string;
        notification: { request: { content: { data?: Record<string, unknown> | null } } };
      };
      const action = typed.actionIdentifier;
      // The default tap, plus our VIEW / CONFIRM buttons, all route to the booking.
      const routes =
        action === notifications.DEFAULT_ACTION_IDENTIFIER ||
        action === 'VIEW' ||
        action === 'CONFIRM' ||
        action === undefined;
      if (!routes) return;
      const bookingId = extractBookingId(typed.notification.request.content.data);
      if (bookingId) {
        setPendingBookingRoute(bookingId);
      }
      // The last response persists for the whole PROCESS, so any remount of this
      // provider would read the same tap back out of the native module and act on
      // it again. Clear it the moment it has been parked (the expo-notifications
      // docs call this out for exactly this case: apps that pick a route from the
      // response and must not keep picking it).
      try {
        notifications.clearLastNotificationResponse();
      } catch (error) {
        // Throws UnavailabilityError when the JS is ahead of the native binary
        // (an OTA update onto an older build) — nothing to clear there anyway.
        console.warn('[push] could not clear the last notification response:', error);
      }
      void clearBadge(notifications);
    };

    void (async () => {
      try {
        // Statically bundled per-platform (null on web) — see notificationsModule.
        if (!Notifications) return;
        if (cancelled) return;
        const notifications = Notifications;

        notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });

        await configureAndroidChannels(notifications);
        await configureNotificationCategories(notifications);
        if (cancelled) return;

        subscription = notifications.addNotificationResponseReceivedListener((response) => {
          handleResponse(notifications, response);
        });

        // Cold start: the tap that LAUNCHED the app isn't delivered to the
        // listener above — fetch it explicitly and route once.
        const lastResponse = await notifications.getLastNotificationResponseAsync();
        if (!cancelled && lastResponse) {
          handleResponse(notifications, lastResponse);
        } else if (!cancelled) {
          // Opened the app normally (no notification tap) — drop any stale badge.
          void clearBadge(notifications);
        }
      } catch (error) {
        console.warn('[push] notification listener setup failed:', error);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
    // Mount-once: nothing in here depends on render state, and re-running it
    // would re-read the launch response and re-route the same tap.
  }, []);

  return <>{children}</>;
}
