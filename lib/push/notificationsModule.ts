/**
 * Web fallback — expo-notifications is native-only for our purposes. The
 * `.native.ts` sibling statically re-exports the real module on iOS/Android.
 *
 * Static platform-split replaces the old `await import('expo-notifications')`:
 * Metro's lazy async chunks intermittently failed with "Requiring unknown
 * module" races in dev (and pinned chunk ids in release), crashing startup.
 * A static import resolves at bundle time on every platform.
 */
export const Notifications: typeof import('expo-notifications') | null = null;
