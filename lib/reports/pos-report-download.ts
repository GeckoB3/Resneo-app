import { Platform } from 'react-native';

import { getApiUrl } from '@/lib/env';
import { posHeaders } from '@/lib/pos/api';
import { filenameFromDisposition } from '@/lib/reports/pos-report-format';

/**
 * Downloads a file a POS report route builds (a CSV, a voucher PDF) with the Bearer token and opens
 * the share sheet, as the web's `useCsvDownload` downloads it. The route checks `export` and writes
 * every cell through csv-cell, so nothing here builds CSV. The file keeps the name the server gave
 * it (Content-Disposition). A refusal answers with the server's own sentence, word for word.
 *
 * Unlike `downloadAndShareFile`, a failed download's body is read back, so a 403 or 400 says what
 * the server said rather than a status number.
 */
export type ReportDownloadResult = { ok: true; filename: string } | { ok: false; message: string | null; status?: number };

function errorSentence(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    const body = JSON.parse(text) as { error?: unknown };
    return typeof body.error === 'string' && body.error.trim() ? body.error : null;
  } catch {
    return null;
  }
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] ?? null : null;
}

export async function downloadReportFile(args: {
  /** The route path with its query, e.g. `/api/venue/reports/takings?preset=today&format=csv`. */
  path: string;
  accessToken: string;
  fallbackFilename: string;
  mimeType: string;
  dialogTitle?: string;
}): Promise<ReportDownloadResult> {
  const { path, accessToken, fallbackFilename, mimeType, dialogTitle } = args;
  const url = `${getApiUrl()}${path}`;
  const headers = { ...posHeaders(), Authorization: `Bearer ${accessToken}` };

  if (Platform.OS === 'web') {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return { ok: false, message: errorSentence(await res.text().catch(() => '')), status: res.status };
      const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackFilename);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
      return { ok: true, filename };
    } catch {
      return { ok: false, message: null };
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the legacy sub-path exports downloadAsync
    const FileSystem = require('expo-file-system/legacy') as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing') as any;
    const cacheDir = (FileSystem.cacheDirectory as string | null) ?? '';
    const temp = `${cacheDir}report-${Date.now()}.download`;
    const result = (await FileSystem.downloadAsync(url, temp, { headers })) as {
      status?: number;
      uri: string;
      headers?: Record<string, string>;
    };
    if (typeof result.status === 'number' && result.status >= 400) {
      const text = (await FileSystem.readAsStringAsync(result.uri).catch(() => null)) as string | null;
      await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
      return { ok: false, message: errorSentence(text), status: result.status };
    }
    const filename = filenameFromDisposition(headerValue(result.headers, 'Content-Disposition'), fallbackFilename);
    const target = `${cacheDir}${filename}`;
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    await FileSystem.moveAsync({ from: result.uri, to: target });
    if (typeof Sharing?.isAvailableAsync === 'function' && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(target, { mimeType, dialogTitle: dialogTitle ?? filename });
      return { ok: true, filename };
    }
    return { ok: false, message: 'Sharing is not available on this device.' };
  } catch {
    return { ok: false, message: null };
  }
}
