import { Platform } from 'react-native';

import { ApiError, apiErrorCode, apiFetch, isApiErrorBody } from '@/lib/api/client';
import { getInstalledStoreVersion } from '@/lib/app-update/app-update-runtime';
import type { PosSale } from '@/types/pos';

/**
 * The sale API client (POS plan P7-1, UX spec §13.2): every `/api/venue/pos` call goes through
 * here. Nothing else in the app calls those routes, and nothing here runs unless the venue's
 * `pos_enabled` is on (`lib/pos/pos-enabled.ts`), so venues without POS send exactly the requests
 * they sent before.
 *
 * Two headers ride on POS calls only:
 * - `X-ResNeo-Client`: the platform, the store version and the over-the-air update id (plan §4.22).
 *   Only POS requests carry it in this step, so no request a venue without POS makes changes.
 * - `x-pos-device`: a short name for this phone, which the web records when a sale is parked
 *   ("Parked by Sam on iPhone at 14:20", PQ19).
 */

const CLIENT_HEADER = 'X-ResNeo-Client';
const DEVICE_HEADER = 'x-pos-device';

function updateId(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- read defensively, as build-channel.ts does
    const updates = require('expo-updates') as { updateId?: string | null };
    return updates.updateId?.trim() || null;
  } catch {
    return null;
  }
}

function deviceName(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native read
    const device = require('expo-device') as { modelName?: string | null; deviceName?: string | null };
    const name = device.modelName?.trim();
    if (name) return name.slice(0, 120);
  } catch {
    // fall through
  }
  return Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android phone' : 'Phone';
}

/** `ios; store=1.2.0; update=0b6f…` (fields the web can parse; unknown parts are left out). */
export function clientHeaderValue(input: { platform: string; storeVersion: string | null; updateId: string | null }): string {
  const parts = [input.platform];
  if (input.storeVersion) parts.push(`store=${input.storeVersion}`);
  if (input.updateId) parts.push(`update=${input.updateId}`);
  return parts.join('; ');
}

export function posHeaders(): Record<string, string> {
  return {
    [CLIENT_HEADER]: clientHeaderValue({
      platform: Platform.OS,
      storeVersion: getInstalledStoreVersion(),
      updateId: updateId(),
    }),
    [DEVICE_HEADER]: deviceName(),
  };
}

export type PosMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** One POS request. Bodies are JSON; the server's `{ error }` sentence becomes the ApiError message. */
export function posFetch<T>(
  path: string,
  options: { accessToken: string; method?: PosMethod; body?: unknown; timeoutMs?: number },
): Promise<T> {
  return apiFetch<T>(path, {
    accessToken: options.accessToken,
    method: options.method ?? 'GET',
    headers: posHeaders(),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}

export const posPaths = {
  bootstrap: '/api/venue/pos/bootstrap',
  catalogue: '/api/venue/pos/catalogue',
  queue: (date?: string | null) => `/api/venue/pos/queue${date ? `?date=${encodeURIComponent(date)}` : ''}`,
  sales: '/api/venue/pos/sales',
  saleList: (params: { status?: string | null; q?: string | null; from?: string | null; to?: string | null; cursor?: string | null }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set('status', params.status);
    if (params.q?.trim()) sp.set('q', params.q.trim());
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    if (params.cursor) sp.set('cursor', params.cursor);
    const qs = sp.toString();
    return `/api/venue/pos/sales${qs ? `?${qs}` : ''}`;
  },
  sale: (saleId: string) => `/api/venue/pos/sales/${encodeURIComponent(saleId)}`,
  saleAction: (saleId: string, action: string) => `/api/venue/pos/sales/${encodeURIComponent(saleId)}/${action}`,
  discount: (saleId: string, discountId: string, version: number) =>
    `/api/venue/pos/sales/${encodeURIComponent(saleId)}/discounts/${encodeURIComponent(discountId)}?version=${version}`,
  cancelPayment: (saleId: string, paymentId: string) =>
    `/api/venue/pos/sales/${encodeURIComponent(saleId)}/payments/${encodeURIComponent(paymentId)}/cancel`,
  // Pass V: gift vouchers and account credit. A code never goes in a path: the look-up takes it
  // in the body (plan §4.33.2).
  voucherSettings: '/api/venue/pos/voucher-settings',
  voucherLookup: '/api/venue/pos/vouchers/lookup',
  voucherPdf: (voucherId: string) => `/api/venue/pos/vouchers/${encodeURIComponent(voucherId)}/pdf`,
  guestStoredValue: (guestId: string) => `/api/venue/guests/${encodeURIComponent(guestId)}/stored-value`,
  reportAccess: '/api/venue/reports/pos-access',
  takings: (query: string) => `/api/venue/reports/takings?${query}`,
  salesReport: (query: string) => `/api/venue/reports/sales?${query}`,
} as const;

/**
 * A write refused because the sale moved on (412 POS_SALE_STALE): the answer carries the fresh
 * sale, which replaces the one on screen (UX spec §3.23, `stale.notice`). Null for anything else.
 */
export function staleSaleFrom(error: unknown): PosSale | null {
  if (!(error instanceof ApiError) || error.status !== 412) return null;
  if (apiErrorCode(error) !== 'POS_SALE_STALE') return null;
  const body = error.body as { sale?: PosSale } | undefined;
  return body?.sale && typeof body.sale === 'object' ? body.sale : null;
}

/** Any fresh sale an error body carries (stale writes, a card that went through after all). */
export function saleFromErrorBody(error: unknown): PosSale | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body as { sale?: PosSale } | undefined;
  return body?.sale && typeof body.sale === 'object' && typeof body.sale.id === 'string' ? body.sale : null;
}

/** `POS_BOOKING_ON_OTHER_SALE` names the other sale. */
export function otherSaleIdFrom(error: unknown): string | null {
  if (apiErrorCode(error) !== 'POS_BOOKING_ON_OTHER_SALE' || !(error instanceof ApiError)) return null;
  const body = error.body as { sale_id?: unknown };
  return typeof body?.sale_id === 'string' ? body.sale_id : null;
}

/** The sentence to show for a failed POS call: the server's own words, word for word, when it sent one. */
export function posErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (isApiErrorBody(error.body) && error.body.error.trim()) return error.body.error;
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
