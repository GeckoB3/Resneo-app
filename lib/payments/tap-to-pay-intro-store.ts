import { Platform } from 'react-native';

/**
 * "Has this person seen the Tap to Pay on iPhone introduction on this phone?"
 *
 * Apple requires the in-app introduction to reach every eligible user at least
 * once (checklist 3.2 / 6.2), and no more than that is needed. Kept per user,
 * because a shared salon phone changes hands.
 *
 * A file in the app's documents folder rather than SecureStore on purpose: the
 * keychain survives deleting the app, the documents folder does not, so a fresh
 * install shows the introduction again — which is how it gets re-recorded for
 * Apple's review videos.
 */

interface LegacyFileSystem {
  documentDirectory: string | null;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  writeAsStringAsync(uri: string, contents: string): Promise<void>;
}

function fileSystem(): LegacyFileSystem | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system/legacy') as LegacyFileSystem;
    return fs?.documentDirectory ? fs : null;
  } catch {
    return null;
  }
}

const FOLDER = 'tap-to-pay';

function markerUri(fs: LegacyFileSystem, userId: string): string {
  // User ids are UUIDs; anything else is reduced to safe filename characters.
  const safe = userId.replace(/[^a-zA-Z0-9-]/g, '_');
  return `${fs.documentDirectory}${FOLDER}/intro-seen-${safe}`;
}

/** True once the introduction has been shown to this user on this phone. */
export async function hasSeenTapToPayIntro(userId: string): Promise<boolean> {
  const fs = fileSystem();
  // Nowhere to remember it: say "seen" so it can never nag on every launch.
  if (!fs) return true;
  try {
    return (await fs.getInfoAsync(markerUri(fs, userId))).exists;
  } catch {
    return true;
  }
}

export async function markTapToPayIntroSeen(userId: string): Promise<void> {
  const fs = fileSystem();
  if (!fs) return;
  try {
    await fs.makeDirectoryAsync(`${fs.documentDirectory}${FOLDER}/`, { intermediates: true });
    await fs.writeAsStringAsync(markerUri(fs, userId), new Date().toISOString());
  } catch {
    // Worst case it shows once more; never worth failing over.
  }
}
