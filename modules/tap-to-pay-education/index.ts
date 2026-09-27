import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Apple's Tap to Pay on iPhone merchant education (`ProximityReaderDiscovery`,
 * iOS 18+). See `ios/TapToPayEducationModule.swift` for why it is native.
 *
 * Absent everywhere else — Android, web, Expo Go, Jest, and any binary built
 * before this module existed — so every entry point degrades to "not available"
 * and the caller shows the app's own education screens instead.
 */
type TapToPayEducationNative = {
  isAvailable(): boolean;
  showHowToTapAsync(): Promise<void>;
};

function getNative(): TapToPayEducationNative | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<TapToPayEducationNative>('TapToPayEducation');
  } catch {
    return null;
  }
}

/** True when Apple's own education can be shown on this phone. */
export function isAppleTapToPayEducationAvailable(): boolean {
  try {
    return getNative()?.isAvailable() === true;
  } catch {
    return false;
  }
}

/**
 * Present Apple's "how to tap" education. Resolves true once it has been shown,
 * false when it is unavailable or Apple could not provide it (offline, busy),
 * so the caller can fall back to the app's own screens.
 */
export async function showAppleTapToPayEducation(): Promise<boolean> {
  const native = getNative();
  if (!native || !isAppleTapToPayEducationAvailable()) return false;
  try {
    await native.showHowToTapAsync();
    return true;
  } catch {
    return false;
  }
}
