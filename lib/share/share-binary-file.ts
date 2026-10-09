import { Platform } from 'react-native';

/**
 * Download a file the API serves (a CSV, an .xlsx workbook or a PDF) and hand it to the OS
 * share sheet, as `shareTextFile` does for text the app builds itself. The bytes never pass
 * through JavaScript: `expo-file-system` fetches straight to the cache with the Bearer header.
 */
export type ShareBinaryResult = { ok: true } | { ok: false; message: string; status?: number };

export async function downloadAndShareFile(args: {
  url: string;
  filename: string;
  mimeType: string;
  headers: Record<string, string>;
  dialogTitle?: string;
}): Promise<ShareBinaryResult> {
  const { url, filename, mimeType, headers, dialogTitle } = args;
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return { ok: false, message: `Export failed (${res.status}).`, status: res.status };
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Browser download failed.' };
    }
  }
  try {
    // Legacy sub-path: it is the one that exports cacheDirectory and downloadAsync.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as any;
    const cacheDir = (FileSystem.cacheDirectory as string | null) ?? '';
    const uri = `${cacheDir}${filename}`;
    const result = (await FileSystem.downloadAsync(url, uri, { headers })) as { status?: number; uri: string };
    if (typeof result.status === 'number' && result.status >= 400) {
      return {
        ok: false,
        message: result.status === 403 ? 'Only admins can export data.' : `Export failed (${result.status}).`,
        status: result.status,
      };
    }
    if (typeof Sharing?.isAvailableAsync === 'function' && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(result.uri, { mimeType, dialogTitle: dialogTitle ?? `Export ${filename}` });
      return { ok: true };
    }
    return { ok: false, message: 'Sharing is not available on this device.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not download the file.' };
  }
}

/** A file `downloadFileToCache` saved, or why it could not. */
export type CachedFileResult = { ok: true; uri: string } | { ok: false; message: string; status?: number };

/**
 * Download a file the API serves into the cache directory without sharing it, for a caller that
 * shares several files in turn (the packing slips for several orders). The bytes go straight to
 * disk with the Bearer header, as in `downloadAndShareFile`. Native only: on the web there is no
 * cache directory, so the caller downloads through `downloadAndShareFile` instead.
 */
export async function downloadFileToCache(args: {
  url: string;
  filename: string;
  headers: Record<string, string>;
}): Promise<CachedFileResult> {
  const { url, filename, headers } = args;
  if (Platform.OS === 'web') return { ok: false, message: 'Not available in a browser.' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as any;
    const cacheDir = (FileSystem.cacheDirectory as string | null) ?? '';
    const result = (await FileSystem.downloadAsync(url, `${cacheDir}${filename}`, { headers })) as { status?: number; uri: string };
    if (typeof result.status === 'number' && result.status >= 400) {
      return { ok: false, message: `Download failed (${result.status}).`, status: result.status };
    }
    return { ok: true, uri: result.uri };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not download the file.' };
  }
}

/**
 * Hand one file already on the device to the OS share sheet. `expo-sharing` takes one file per
 * sheet, so several files are shared one after another. Resolves when the sheet closes.
 */
export async function shareCachedFile(
  uri: string,
  options: { mimeType: string; dialogTitle?: string },
): Promise<ShareBinaryResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as any;
    if (typeof Sharing?.isAvailableAsync === 'function' && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, { mimeType: options.mimeType, dialogTitle: options.dialogTitle });
      return { ok: true };
    }
    return { ok: false, message: 'Sharing is not available on this device.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not share the file.' };
  }
}
