import { Platform } from 'react-native';

import { downloadAndShareFile, downloadFileToCache } from '@/lib/share/share-binary-file';
import { packingSlipFilename } from '@/lib/shop/order-words';
import type { ShopOrderRow } from '@/types/shop';

/**
 * Packing slips for several orders at once (UX spec §8.6 `ord.bulk.packingSlips`), the app's side
 * of the web's /dashboard/orders/packing-slips page. The web prints this venue's paid orders that
 * are not cancelled, at most 50 at a time (`loadPackingSlipOrdersFor`); every row in the Orders
 * list is a paid order, so the one rule left to mirror is "not cancelled".
 *
 * There is no PDF route for several orders, so each slip comes from the single-order route
 * (`/api/venue/shop/orders/{id}/packing-slip.pdf`, Bearer) into the cache, and the share sheet
 * then takes them one at a time: `expo-sharing` shares one file per sheet.
 */

/** The most slips the web prints at once; it skips any past this. */
export const PACKING_SLIP_LIMIT = 50;

/** One order to print a slip for. */
export interface SlipOrder {
  id: string;
  number: number;
}

/** A slip saved to the cache, ready for the share sheet. */
export interface ReadySlip extends SlipOrder {
  uri: string;
}

/** A slip that could not be fetched, with the HTTP status when there was one. */
export interface FailedSlip extends SlipOrder {
  status?: number;
}

/** Cancelled orders have no packing slip (the PDF route answers 404 for them). */
export function canPrintPackingSlip(row: Pick<ShopOrderRow, 'fulfilment_status'>): boolean {
  return row.fulfilment_status !== 'cancelled';
}

/** The chosen orders in order number order, at most `PACKING_SLIP_LIMIT`. */
export function slipOrdersInPrintOrder(orders: SlipOrder[]): SlipOrder[] {
  return [...orders].sort((a, b) => a.number - b.number).slice(0, PACKING_SLIP_LIMIT);
}

/** The web page that prints the same slips, for a server without the PDF route. */
export function webPackingSlipsUrl(webBase: string, ids: string[]): string {
  return `${webBase}/dashboard/orders/packing-slips?ids=${ids.map(encodeURIComponent).join(',')}`;
}

/** "Order 12", "Order 12 and Order 15", "Order 12, Order 15 and Order 20". */
export function joinOrderNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * True when every slip failed with 404: a server from before the PDF route, so the caller opens
 * the web page instead, as the single slip does.
 */
export function slipRouteMissing(result: { ready: ReadySlip[]; failed: FailedSlip[] }): boolean {
  return result.ready.length === 0 && result.failed.length > 0 && result.failed.every((f) => f.status === 404);
}

/**
 * Fetch each slip in turn into the cache. One failing does not stop the rest. `onProgress` gets
 * the slip about to be fetched (1-based); `shouldStop` is checked before each one. In a browser,
 * where there is no cache, each slip downloads as its own file instead and none come back ready.
 */
export async function fetchPackingSlips(args: {
  orders: SlipOrder[];
  apiUrl: string;
  headers: Record<string, string>;
  pathFor: (id: string) => string;
  onProgress?: (current: number, total: number) => void;
  shouldStop?: () => boolean;
}): Promise<{ ready: ReadySlip[]; failed: FailedSlip[]; stopped: boolean }> {
  const { orders, apiUrl, headers, pathFor, onProgress, shouldStop } = args;
  const ready: ReadySlip[] = [];
  const failed: FailedSlip[] = [];
  for (let i = 0; i < orders.length; i += 1) {
    if (shouldStop?.()) return { ready, failed, stopped: true };
    const order = orders[i];
    onProgress?.(i + 1, orders.length);
    const url = `${apiUrl}${pathFor(order.id)}`;
    const filename = packingSlipFilename(order.number);
    if (Platform.OS === 'web') {
      const res = await downloadAndShareFile({ url, filename, mimeType: 'application/pdf', headers });
      if (!res.ok) failed.push({ ...order, status: res.status });
      continue;
    }
    const res = await downloadFileToCache({ url, filename, headers });
    if (res.ok) ready.push({ ...order, uri: res.uri });
    else failed.push({ ...order, status: res.status });
  }
  return { ready, failed, stopped: false };
}
