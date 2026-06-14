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

function buildCsvText(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/**
 * Write CSV rows to a temp file and open the OS share sheet.
 * Falls back gracefully when expo-sharing is not installed.
 */
export async function buildAndShareCsv(filename: string, rows: string[][]): Promise<void> {
  const csvText = buildCsvText(rows);

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
        await FileSystem.writeAsStringAsync(uri, csvText, {
          encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
        });
        await Sharing.shareAsync(uri, {
          mimeType: 'text/csv',
          dialogTitle: `Export ${filename}`,
          UTI: 'public.comma-separated-values-text',
        });
        return;
      }
    }
  } catch {
    // expo-file-system/legacy or expo-sharing not installed — fall through
  }

  // ── Web: Blob download ───────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // No React context here to toast from; Alert.alert is a no-op on web.
      // Web is a dev-only target (production export uses the native share path).
      console.error('[csv-export] browser download failed:', err);
    }
    return;
  }

  // ── Native fallback: share as plain text ─────────────────────────────────
  await Share.share({
    title: filename,
    message: csvText,
  });
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
