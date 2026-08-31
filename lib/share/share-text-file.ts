import { Platform, Share } from 'react-native';

/**
 * Hand the user a text file, by whatever route this platform offers.
 *
 * Lifted out of `lib/reports/csv-export.ts` unchanged, so the CSV export and
 * the customer's account export share one implementation instead of two copies
 * of a three-strategy fallback that would drift. The strategies, in order:
 *
 * 1. **A real file plus the native share sheet**, when `expo-file-system` and
 *    `expo-sharing` are both present. This is the good path on device: the file
 *    carries the right name and mime type, so the receiving app knows what it
 *    is.
 * 2. **A browser download** on web.
 * 3. **`Share.share()` with the body as text**, which works everywhere and is
 *    what an old binary or Expo Go falls back to.
 *
 * Both native modules are loaded with `require()` inside a `try`, not imported
 * at module scope. That is deliberate: a static import would put them in every
 * bundle that reaches this file, and the web bundler refuses some native-only
 * modules outright, which is how `eas update` broke once already.
 */

export type ShareFileResult =
  | { ok: true }
  | { ok: false; reason: 'web-download' | 'share'; message: string };

export interface ShareTextFileArgs {
  filename: string;
  body: string;
  /** e.g. `text/csv` or `application/json`. */
  mimeType: string;
  /** Apple's uniform type identifier, when the platform wants one. */
  uti?: string;
  dialogTitle?: string;
}

export async function shareTextFile(args: ShareTextFileArgs): Promise<ShareFileResult> {
  const { filename, body, mimeType, uti, dialogTitle } = args;

  // 1. A real file plus the native share sheet.
  try {
    // Legacy sub-path: it is the one that exports cacheDirectory and
    // writeAsStringAsync.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as any;

    if (typeof Sharing?.isAvailableAsync === 'function') {
      const isAvailable = (await Sharing.isAvailableAsync()) as boolean;
      if (isAvailable && typeof FileSystem?.writeAsStringAsync === 'function') {
        const cacheDir = (FileSystem.cacheDirectory as string | null) ?? '';
        const uri = `${cacheDir}${filename}`;
        await FileSystem.writeAsStringAsync(uri, body, {
          encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
        });
        await Sharing.shareAsync(uri, {
          mimeType,
          dialogTitle: dialogTitle ?? `Export ${filename}`,
          ...(uti ? { UTI: uti } : {}),
        });
        return { ok: true };
      }
    }
  } catch {
    // Either module unavailable at runtime. Fall through.
  }

  // 2. Web: a Blob download.
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([body], { type: `${mimeType};charset=utf-8;` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (err) {
      // Reported back rather than only logged, so a screen with a toast host
      // can tell the user the download failed.
      const message = err instanceof Error ? err.message : 'Browser download failed.';
      console.error('[share-text-file] browser download failed:', err);
      return { ok: false, reason: 'web-download', message };
    }
  }

  // 3. Share the body as plain text.
  try {
    await Share.share({ title: filename, message: body });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open the share sheet.';
    return { ok: false, reason: 'share', message };
  }
}
