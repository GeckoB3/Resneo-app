import { Platform } from 'react-native';

import { ApiError } from '@/lib/api/client';
import { scanCandidates } from '@/lib/retail/scan';
import type { StocktakeLine } from '@/types/retail';

/**
 * A stocktake's counts kept on this phone for poor signal (POS plan P7-13; UX spec §6.11, §13.6
 * `app.stocktake.offline`).
 *
 * Every count is its own append-only event on the server ("add n" or "set to n") with its own
 * `client_request_id`, so a count is saved here first, sent in order, and dropped once the server
 * has it. A count that cannot reach the server stays, with its request id, and is sent again when
 * the phone is back online: a retry of the same event is recorded once. The rows show the count
 * with the waiting events applied, so counting carries on while offline.
 *
 * One JSON file per stocktake in the app's documents folder (SecureStore is for secrets and caps a
 * value's size; AsyncStorage is not in the app), dropped once empty, after 7 days, and at sign-out.
 * Every access is guarded: a phone with no room, or the web, just does not keep the draft.
 */

export interface PendingCount {
  client_request_id: string;
  variant_id: string;
  kind: 'add' | 'set';
  quantity: number;
  /** Send it even though it is outside a partial count (`take.scan.countAnyway`). */
  count_anyway?: boolean;
  /** "Product, option", for the messages. */
  label: string;
  at: number;
}

const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FOLDER = 'stocktake-drafts';

interface StoredDraft {
  version: typeof VERSION;
  savedAt: number;
  pending: PendingCount[];
}

/** A count that did not reach the server (no network, or it timed out): keep it and try again. */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 408);
}

/**
 * The count a row shows: the server's, with the counts still waiting on this phone applied in
 * order ("set to n" replaces it, "add n" adds to it). Null while nothing is counted.
 */
export function countWithPending(serverCounted: number | null, pending: PendingCount[], variantId: string): number | null {
  let count = serverCounted;
  for (const p of pending) {
    if (p.variant_id !== variantId) continue;
    count = p.kind === 'set' ? p.quantity : (count ?? 0) + p.quantity;
  }
  return count;
}

/**
 * The line a barcode or SKU names in this stocktake (a scan adds one to it). A barcode matches in
 * any form it may be stored under (`scanCandidates`: UPC-A with or without its leading 0).
 */
export function lineForCode(lines: StocktakeLine[], code: string): StocktakeLine | null {
  const c = code.trim();
  if (!c) return null;
  const lc = c.toLowerCase();
  const forms = scanCandidates(c);
  return (
    lines.find((l) => l.barcodes.some((b) => forms.includes(b)) || (l.sku !== null && l.sku.trim().toLowerCase() === lc)) ?? null
  );
}

/** Whether a row matches what is typed in the scan-or-search field. */
export function lineMatches(l: StocktakeLine, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return (
    `${l.product_name} ${l.option_name ?? ''}`.toLowerCase().includes(q) ||
    (l.sku ?? '').toLowerCase().includes(q) ||
    l.barcodes.some((b) => b.includes(term.trim()))
  );
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

function fileUri(fs: LegacyFileSystem, stocktakeId: string): string {
  // A stocktake id is a uuid; anything else is reduced to safe file-name characters.
  return `${folderUri(fs)}v${VERSION}-${stocktakeId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
}

function isPending(x: unknown): x is PendingCount {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.client_request_id === 'string' &&
    typeof p.variant_id === 'string' &&
    (p.kind === 'add' || p.kind === 'set') &&
    typeof p.quantity === 'number' &&
    Number.isInteger(p.quantity) &&
    p.quantity >= 0
  );
}

export async function loadStocktakeDraft(stocktakeId: string): Promise<PendingCount[]> {
  const fs = fileSystem();
  if (!fs) return [];
  try {
    const uri = fileUri(fs, stocktakeId);
    const info = await fs.getInfoAsync(uri);
    if (!info.exists) return [];
    const parsed = JSON.parse(await fs.readAsStringAsync(uri)) as StoredDraft;
    if (parsed?.version !== VERSION || !Array.isArray(parsed.pending)) return [];
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
      await fs.deleteAsync(uri, { idempotent: true });
      return [];
    }
    return parsed.pending.filter(isPending).map((p) => ({ ...p, label: typeof p.label === 'string' ? p.label : '' }));
  } catch {
    return [];
  }
}

export async function saveStocktakeDraft(stocktakeId: string, pending: PendingCount[]): Promise<void> {
  const fs = fileSystem();
  if (!fs) return;
  try {
    const uri = fileUri(fs, stocktakeId);
    if (pending.length === 0) {
      await fs.deleteAsync(uri, { idempotent: true });
      return;
    }
    await fs.makeDirectoryAsync(folderUri(fs), { intermediates: true }).catch(() => undefined);
    const value: StoredDraft = { version: VERSION, savedAt: Date.now(), pending };
    await fs.writeAsStringAsync(uri, JSON.stringify(value));
  } catch {
    // No room or no access: counting still works, the draft just will not survive a restart.
  }
}

/** Sign-out: forget every stocktake draft on this phone (the web's Clear-Site-Data). */
export async function clearAllStocktakeDrafts(): Promise<void> {
  const fs = fileSystem();
  if (!fs) return;
  try {
    await fs.deleteAsync(folderUri(fs), { idempotent: true });
  } catch {
    // Nothing to do.
  }
}
