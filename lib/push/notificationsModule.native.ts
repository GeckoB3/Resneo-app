/** Native (iOS/Android) — statically bundled. See notificationsModule.ts. */
import * as ExpoNotifications from 'expo-notifications';

export const Notifications: typeof import('expo-notifications') | null = ExpoNotifications;
