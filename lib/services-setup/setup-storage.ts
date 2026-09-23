/**
 * The AI services setup's review in progress, kept on this phone so closing the sheet or the
 * app loses nothing (web `setup-storage.ts`, which keeps it in the browser's localStorage).
 *
 * @see _reference/Resneo/src/components/dashboard/appointment-services/services-setup/setup-storage.ts
 *
 * Services already added are in the database; this holds what is still being checked. One JSON
 * file per venue in the app's documents folder (SecureStore is for secrets and caps a value's
 * size; AsyncStorage is not in the app), dropped after 14 days, when nothing is left pending,
 * and at sign-out, as the web's sign-out clears site data. Every access is guarded: a phone with
 * no room, or a platform without a file system (web), just does not keep the review.
 */

import { Platform } from 'react-native';

import { normaliseStoredDraft, type ServiceDraft, type SetupDefaults } from './drafts';

/** An add-on group this setup made, so later extras under the same heading join it. */
export interface SetupAddonGroup {
  id: string;
  name: string;
  /** Lower-cased heading the group was made for ('' for no heading). */
  headingKey: string;
  addons: { draftKey: string; name: string; pricePence: number; minutes: number }[];
  serviceIds: string[];
}

/** Something a read said worth passing on ("your page only showed some services"). */
export interface SetupNotice {
  source: string;
  text: string;
}

const VERSION = 1;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const FOLDER = 'services-setup';

export interface StoredServicesSetup {
  version: typeof VERSION;
  savedAt: number;
  drafts: ServiceDraft[];
  calendarIds: string[] | null;
  instructions: string;
  /** Calendars chosen per heading (lower-cased heading to calendar ids). */
  headingCalendars?: Record<string, string[]>;
  defaults?: SetupDefaults;
  notices?: SetupNotice[];
  addonGroups?: SetupAddonGroup[];
}

/** The slice of `expo-file-system/legacy` used here. */
interface LegacyFileSystem {
  documentDirectory: string | null;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  readAsStringAsync(uri: string): Promise<string>;
  writeAsStringAsync(uri: string, contents: string): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
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

function folderUri(fs: LegacyFileSystem): string {
  return `${fs.documentDirectory}${FOLDER}/`;
}

function fileUri(fs: LegacyFileSystem, venueId: string): string {
  // A venue id is a uuid; anything else is reduced to safe file-name characters.
  return `${folderUri(fs)}v${VERSION}-${venueId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
}

export async function loadServicesSetup(venueId: string | null): Promise<StoredServicesSetup | null> {
  const fs = fileSystem();
  if (!venueId || !fs) return null;
  try {
    const uri = fileUri(fs, venueId);
    const info = await fs.getInfoAsync(uri);
    if (!info.exists) return null;
    const parsed = JSON.parse(await fs.readAsStringAsync(uri)) as StoredServicesSetup;
    if (parsed?.version !== VERSION || !Array.isArray(parsed.drafts)) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
      await fs.deleteAsync(uri, { idempotent: true });
      return null;
    }
    return { ...parsed, drafts: parsed.drafts.map(normaliseStoredDraft) };
  } catch {
    return null;
  }
}

export async function saveServicesSetup(
  venueId: string | null,
  data: Omit<StoredServicesSetup, 'version' | 'savedAt'>,
): Promise<void> {
  const fs = fileSystem();
  if (!venueId || !fs) return;
  try {
    const uri = fileUri(fs, venueId);
    if (!data.drafts.some((d) => d.status === 'pending')) {
      await fs.deleteAsync(uri, { idempotent: true });
      return;
    }
    await fs.makeDirectoryAsync(folderUri(fs), { intermediates: true }).catch(() => undefined);
    const value: StoredServicesSetup = { version: VERSION, savedAt: Date.now(), ...data };
    await fs.writeAsStringAsync(uri, JSON.stringify(value));
  } catch {
    // No room or no access: the setup still works, it just will not survive a restart.
  }
}

export async function clearServicesSetup(venueId: string | null): Promise<void> {
  const fs = fileSystem();
  if (!venueId || !fs) return;
  try {
    await fs.deleteAsync(fileUri(fs, venueId), { idempotent: true });
  } catch {
    // Nothing to do.
  }
}

/** Sign-out: forget every venue's review on this phone (the web's Clear-Site-Data). */
export async function clearAllServicesSetups(): Promise<void> {
  const fs = fileSystem();
  if (!fs) return;
  try {
    await fs.deleteAsync(folderUri(fs), { idempotent: true });
  } catch {
    // Nothing to do.
  }
}
