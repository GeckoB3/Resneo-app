import { Platform } from 'react-native';

/**
 * Download a file the API serves (a CSV, an .xlsx workbook or a PDF) and hand it to the OS
 * share sheet, as `shareTextFile` does for text the app builds itself. The bytes never pass
 * through JavaScript: `expo-file-system` fetches straight to the cache with the Bearer header.
 */
export type ShareBinaryResult = { ok: true } | { ok: false; message: string };

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
      if (!res.ok) return { ok: false, message: `Export failed (${res.status}).` };
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
      return { ok: false, message: result.status === 403 ? 'Only admins can export data.' : `Export failed (${result.status}).` };
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
