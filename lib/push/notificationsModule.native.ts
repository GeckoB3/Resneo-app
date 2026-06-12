/**
 * Native (iOS/Android) — load expo-notifications DEFENSIVELY.
 *
 * Remote-push support was removed from Expo Go in SDK 53, and on an Android build
 * without remote push the expo-notifications module throws *at evaluation time*
 * when it's imported. A static `import` therefore crashes the whole app on launch:
 * the throw propagates through PushNotificationsProvider → AppProviders →
 * app/_layout.tsx, so the root route never finishes evaluating ("missing the
 * required default export" → "Cannot read property 'ErrorBoundary' of undefined").
 *
 * Loading it through a guarded synchronous `require` contains the throw: in Expo
 * Go (or whenever the module is unavailable) `Notifications` is null and push
 * degrades gracefully while the rest of the app boots. `require` keeps the module
 * statically bundled (no lazy async chunk), avoiding the "Requiring unknown
 * module" races the old `await import('expo-notifications')` hit in dev/release.
 * See notificationsModule.ts for the web stub.
 */
import { isExpoGoClient } from '@/lib/push/runtime';

type NotificationsModule = typeof import('expo-notifications');

function loadNotifications(): NotificationsModule | null {
  // Don't even touch the module in Expo Go — importing it there throws.
  if (isExpoGoClient()) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch (error) {
    console.warn('[push] expo-notifications unavailable; push disabled:', error);
    return null;
  }
}

export const Notifications: NotificationsModule | null = loadNotifications();
