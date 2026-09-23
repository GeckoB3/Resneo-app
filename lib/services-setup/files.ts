/**
 * Files for the services setup's uploads: read a picked picture for the painter, and write the
 * JPEGs it draws where `FormData` can send them from. Uses `expo-file-system/legacy`, loaded
 * lazily as the app's other file code does, so a platform without it (web) just skips the work.
 */

import { Platform } from 'react-native';

interface LegacyFileSystem {
  cacheDirectory: string | null;
  readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
}

const UPLOAD_FOLDER = 'services-setup-uploads/';

function fileSystem(): LegacyFileSystem | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('expo-file-system/legacy') as LegacyFileSystem;
    return fs?.cacheDirectory ? fs : null;
  } catch {
    return null;
  }
}

/** A file's bytes as base64, or null when it cannot be read. */
export async function readFileBase64(uri: string): Promise<string | null> {
  const fs = fileSystem();
  if (!fs) return null;
  try {
    return await fs.readAsStringAsync(uri, { encoding: 'base64' });
  } catch {
    return null;
  }
}

/** Write base64 bytes to a cache file and answer its uri, or null when it could not be written. */
export async function writeCacheBase64(fileName: string, base64: string): Promise<string | null> {
  const fs = fileSystem();
  if (!fs) return null;
  try {
    const folder = `${fs.cacheDirectory}${UPLOAD_FOLDER}`;
    await fs.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
    const uri = `${folder}${fileName}`;
    await fs.writeAsStringAsync(uri, base64, { encoding: 'base64' });
    return uri;
  } catch {
    return null;
  }
}

/**
 * A picked document, copied into the setup's own cache folder so the upload can read it.
 *
 * On Android the picker hands back its `content://` link (read through the grant that comes with
 * it); a cache copy made by the picker sits outside Expo Go's project folder, where
 * `expo-file-system`'s `File` (which the upload reads through) refuses it for want of a READ
 * permission. Answers the copy's uri, or the original when it cannot be copied.
 */
export async function stageDocument(uri: string, fileName: string): Promise<string> {
  const b64 = await readFileBase64(uri);
  if (!b64) return uri;
  seq += 1;
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60) || 'document';
  return (await writeCacheBase64(`${Date.now().toString(36)}${seq.toString(36)}-${safe}`, b64)) ?? uri;
}

let seq = 0;

/** Drop the drawn JPEGs once the setup closes; the phone would clear the cache in time anyway. */
export async function clearUploadCache(): Promise<void> {
  const fs = fileSystem();
  if (!fs) return;
  try {
    await fs.deleteAsync(`${fs.cacheDirectory}${UPLOAD_FOLDER}`, { idempotent: true });
  } catch {
    // Nothing to do.
  }
}
