import { Platform } from 'react-native';

/**
 * Location permission for card-present payments.
 *
 * Stripe requires location for card-present on BOTH platforms — it disables
 * card-present outright without it — but the Terminal SDK only ships a
 * permission helper for Android (`requestNeededAndroidPermissions`). It exposes
 * nothing for iOS, so the app has to ask itself. Until this existed, iOS never
 * asked at all: the Android branch in each reader hook was the only request in
 * the codebase, and the gap was invisible because iOS had never run the code.
 *
 * `expo-location` is required lazily for the same reason the Terminal SDK is
 * (see `terminal-sdk.ts`): the payment surface must stay completely inert on a
 * build that does not carry the native module, rather than throwing at import.
 *
 * Note there is no matching Bluetooth request. iOS has no pre-authorisation API
 * for Bluetooth — the system prompts on first use, driven by
 * `NSBluetoothAlwaysUsageDescription`, which the Stripe config plugin writes.
 *
 * `expo-location` is deliberately NOT added to `app.json`'s plugins array. Its
 * config plugin exists only to write the location usage strings, and the Stripe
 * Terminal plugin already writes `NSLocationWhenInUseUsageDescription` from its
 * `locationWhenInUsePermission` prop. Adding both would leave two plugins
 * fighting over one Info.plist key for no gain — the native module autolinks
 * either way. Don't "fix" the missing plugin entry.
 */

type LocationModule = {
  requestForegroundPermissionsAsync: () => Promise<{ status: string; canAskAgain?: boolean }>;
  getForegroundPermissionsAsync: () => Promise<{ status: string; canAskAgain?: boolean }>;
};

function getLocationModule(): LocationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('expo-location') as Partial<LocationModule>;
    if (typeof mod?.requestForegroundPermissionsAsync !== 'function') return null;
    return mod as LocationModule;
  } catch {
    return null;
  }
}

/** Copy matches the Android refusal in `androidPermissionMessage`. */
export const LOCATION_REFUSED_MESSAGE =
  'Location permission is needed to take card payments. Turn it on for Resneo in your phone app settings.';

/**
 * Ask for foreground location on iOS. Returns an error message when it was
 * refused, or null when granted (or when there is nothing to do).
 *
 * Deliberately NOT time-boxed: this puts a system dialog on screen and the staff
 * member may take as long as they like to answer it — the same reasoning the
 * Android branch already documents.
 *
 * A missing module resolves to null rather than an error. Card-present will then
 * fail further in with Stripe's own message, which is a better outcome than
 * blocking a reader that might have worked; the alternative is inventing a
 * permission failure we have not actually observed.
 */
export async function ensureIosLocationPermission(
  platform: string = Platform.OS,
): Promise<string | null> {
  if (platform !== 'ios') return null;

  const location = getLocationModule();
  if (!location) return null;

  try {
    // Check before asking: `request` re-prompts only the first time, so on a
    // later refusal it resolves instantly and we would report nothing useful.
    const current = await location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return null;

    const next = await location.requestForegroundPermissionsAsync();
    if (next.status === 'granted') return null;
    return LOCATION_REFUSED_MESSAGE;
  } catch {
    // Never let the permission probe itself be what stops a payment.
    return null;
  }
}
