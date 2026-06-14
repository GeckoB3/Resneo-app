/**
 * Client-side CSV generation + share helpers for the Reports screen.
 *
 * Strategy:
 * 1. If expo-file-system (legacy API) + expo-sharing are both installed at runtime,
 *    write to a temp file and open the native share sheet.
 * 2. If on web, trigger a Blob download in the browser.
 * 3. Fallback: React Native Share.share() passes CSV as text (works everywhere).
 *
 * Both expo-file-system and expo-sharing are loaded with dynamic require() and
 * typed with `unknown` so the code compiles whether or not they are installed.
 * expo-file-system ships with expo-router (SDK 56), expo-sharing does not — it
 * would need to be added to package.json to get proper file-share behaviour.
 */
import { Platform, Share } from 'react-native';

/**
 * Outcome of a share/download attempt. `buildAndShareCsv` resolves with this
 * rather than throwing so existing fire-and-forget callers keep working, while
 * callers with a toast host (e.g. the contacts export) can surface failures.
 *
 * W2.7: the web Blob-download path used to only `console.error` (no React
 * context to toast from). It now reports back through this result instead.
 */
export type CsvShareResult =
  | { ok: true }
  | { ok: false; reason: 'web-download' | 'share'; message: string };

/** How many CSV rows to join per synchronous chunk before yielding to the UI. */
const CSV_CHUNK_ROWS = 500;

/** Escape + comma-join a single row of cells into one CSV line. */
function joinCsvRow(row: string[]): string {
  return row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',');
}

/**
 * Build the CSV body in chunks, yielding to the event loop between each batch so
 * a large export (up to several thousand rows) never blocks the JS thread long
 * enough to freeze scrolling or drop the share-sheet animation (W9.4).
 *
 * Equivalent output to a synchronous `rows.map(joinCsvRow).join('\n')`.
 */
export async function buildCsvTextChunked(
  rows: string[][],
  chunkSize: number = CSV_CHUNK_ROWS,
): Promise<string> {
  if (rows.length === 0) return '';
  const lines: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, rows.length);
    for (let j = i; j < end; j += 1) {
      lines[j] = joinCsvRow(rows[j]);
    }
    // Yield between chunks so touch/scroll/paint can interleave. Skipped on the
    // final chunk to avoid a needless extra macrotask.
    if (end < rows.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return lines.join('\n');
}

/**
 * Write CSV rows to a temp file and open the OS share sheet.
 *
 * Resolves with a {@link CsvShareResult}: `{ ok: true }` on success, or
 * `{ ok: false, ... }` when the web download fails or the native share rejects.
 * Never throws for those expected failures, so callers that ignore the return
 * value behave exactly as before (no unhandled rejection).
 *
 * @param rows  Full CSV grid (header + body rows).
 * @param csvText  Optional pre-built body (e.g. from `buildCsvTextChunked`) so a
 *   large export isn't re-joined synchronously here. Built from `rows` if omitted.
 */
export async function buildAndShareCsv(
  filename: string,
  rows: string[][],
  csvText?: string,
): Promise<CsvShareResult> {
  // Use the chunked builder by default so even reports that grow large don't
  // block the JS thread. For small grids it completes in a single chunk with no
  // extra yields, so the cost is negligible.
  const body = csvText ?? (await buildCsvTextChunked(rows));

  // ── Try expo-file-system (legacy) + expo-sharing ─────────────────────────
  try {
    // Use legacy sub-path that exports cacheDirectory / writeAsStringAsync
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
          mimeType: 'text/csv',
          dialogTitle: `Export ${filename}`,
          UTI: 'public.comma-separated-values-text',
        });
        return { ok: true };
      }
    }
  } catch {
    // expo-file-system/legacy or expo-sharing not installed — fall through
  }

  // ── Web: Blob download ───────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (err) {
      // W2.7: surface the failure to the caller instead of only console.error,
      // so a screen with a toast host can tell the user the download failed.
      const message = err instanceof Error ? err.message : 'Browser download failed.';
      console.error('[csv-export] browser download failed:', err);
      return { ok: false, reason: 'web-download', message };
    }
  }

  // ── Native fallback: share as plain text ─────────────────────────────────
  try {
    await Share.share({
      title: filename,
      message: body,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open the share sheet.';
    return { ok: false, reason: 'share', message };
  }
}

/** Aggregate booking source keys → display labels, same as web. */
export function formatBookingSourceLabel(source: string): string {
  const map: Record<string, string> = {
    online: 'Online',
    phone: 'Phone',
    'walk-in': 'Walk-in',
    widget: 'Website widget',
    booking_page: 'Booking page',
    staff: 'Staff',
    unknown: 'Unknown',
  };
  return map[source] ?? source;
}

/** Merge raw source keys onto display labels and sort by volume descending. */
export function aggregateSourcesByLabel(
  bySource: Record<string, number>,
): { name: string; value: number }[] {
  const acc = new Map<string, number>();
  for (const [k, v] of Object.entries(bySource)) {
    const label = formatBookingSourceLabel(k);
    acc.set(label, (acc.get(label) ?? 0) + v);
  }
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
