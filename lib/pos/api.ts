import { Platform } from 'react-native';

import { ApiError, apiErrorCode, apiFetch, isApiErrorBody } from '@/lib/api/client';
import { clientBuild, clientHeaderValue, POS_APP_STEP } from '@/lib/pos/client-build';
import type { PosSale } from '@/types/pos';

/**
 * The sale API client (POS plan P7-1, UX spec §13.2): every `/api/venue/pos` call goes through
 * here. Nothing else in the app calls those routes, and nothing here runs unless the venue's
 * `pos_enabled` is on (`lib/pos/pos-enabled.ts`), so venues without POS send exactly the requests
 * they sent before.
 *
 * Two headers ride on POS calls only:
 * - `X-ResNeo-Client`: the platform, the store version, the over-the-air update id (plan §4.22) and,
 *   from app step 2, the POS app step (`pos=2`). Only POS requests carry it, so no request a venue
 *   without POS makes changes.
 * - `x-pos-device`: a short name for this phone, which the web records when a sale is parked
 *   ("Parked by Sam on iPhone at 14:20", PQ19).
 */

const CLIENT_HEADER = 'X-ResNeo-Client';
const DEVICE_HEADER = 'x-pos-device';

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

export { clientHeaderValue, POS_APP_STEP };

export function posHeaders(): Record<string, string> {
  return {
    [CLIENT_HEADER]: clientBuild(),
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
  // Pass 2 (app step 2): card payments.
  payouts: (query: string) => `/api/venue/reports/payouts?${query}`,
  payoutDetail: (query: string, payoutId: string) => `/api/venue/reports/payouts?${query}&payout=${encodeURIComponent(payoutId)}`,
  readers: (refresh: boolean) => `/api/venue/pos/readers${refresh ? '?refresh=1' : ''}`,
  readerPayment: (saleId: string, paymentId: string) =>
    `/api/venue/pos/sales/${encodeURIComponent(saleId)}/payments/${encodeURIComponent(paymentId)}/reader`,
  cardConsent: (saleId: string, paymentId: string) =>
    `/api/venue/pos/sales/${encodeURIComponent(saleId)}/payments/${encodeURIComponent(paymentId)}/card-consent`,
  payLinks: (saleId: string) => `/api/venue/pos/sales/${encodeURIComponent(saleId)}/pay-links`,
  payLinkSend: (saleId: string, linkId: string) =>
    `/api/venue/pos/sales/${encodeURIComponent(saleId)}/pay-links/${encodeURIComponent(linkId)}/send`,
  payLinkCancel: (saleId: string, linkId: string) =>
    `/api/venue/pos/sales/${encodeURIComponent(saleId)}/pay-links/${encodeURIComponent(linkId)}/cancel`,
  guestCards: (guestId: string) => `/api/venue/pos/guests/${encodeURIComponent(guestId)}/cards`,
  guestCard: (guestId: string, cardId: string) =>
    `/api/venue/pos/guests/${encodeURIComponent(guestId)}/cards/${encodeURIComponent(cardId)}`,
  // A sale sent to this phone from the web till (plan §4.36).
  collectRequestsMine: '/api/venue/pos/collect-requests?mine=1',
  collectState: (paymentId: string) => `/api/venue/pos/payments/${encodeURIComponent(paymentId)}/collect`,
  collectClaim: (paymentId: string) => `/api/venue/pos/payments/${encodeURIComponent(paymentId)}/claim`,
  collectCancel: (paymentId: string) => `/api/venue/pos/payments/${encodeURIComponent(paymentId)}/cancel`,
  // Pass 4 (app step 4): products at the till. A search is the catalogue's products only; a scan is
  // one exact barcode look-up.
  productSearch: (q: string) => {
    const sp = new URLSearchParams({ type: 'products' });
    if (q.trim()) sp.set('q', q.trim().slice(0, 80));
    return `/api/venue/pos/catalogue?${sp.toString()}`;
  },
  barcode: (code: string) => `/api/venue/pos/catalogue?barcode=${encodeURIComponent(code.trim().slice(0, 64))}`,
  guestPurchases: (guestId: string) => `/api/venue/guests/${encodeURIComponent(guestId)}/purchases`,
  // Pass LC: loyalty cards and commission.
  saleRewards: (saleId: string) => `/api/venue/pos/sales/${encodeURIComponent(saleId)}/loyalty-reward`,
  guestLoyaltyCard: (guestId: string) => `/api/venue/guests/${encodeURIComponent(guestId)}/loyalty-card`,
  guestLoyaltyAdjust: (guestId: string) => `/api/venue/guests/${encodeURIComponent(guestId)}/loyalty-card/adjust`,
  myCommission: (period: string) => `/api/venue/pos/commission/report?mine=1&period=${encodeURIComponent(period)}`,
  // Pass 3 (app step 3): till sessions, cash-up and end of day (Appendix E #23).
  tillSessions: '/api/venue/pos/sessions',
  openTill: (tillId: string) => `/api/venue/pos/tills/${encodeURIComponent(tillId)}/sessions`,
  tillSession: (sessionId: string) => `/api/venue/pos/sessions/${encodeURIComponent(sessionId)}`,
  tillSessionAction: (sessionId: string, action: 'movements' | 'count' | 'close' | 'email' | 'attachments') =>
    `/api/venue/pos/sessions/${encodeURIComponent(sessionId)}/${action}`,
  tillReportPdf: (sessionId: string) => `/api/venue/pos/sessions/${encodeURIComponent(sessionId)}/report.pdf`,
  cashTipsDue: '/api/venue/pos/tips/cash-due',
  endOfDay: (date?: string | null) => `/api/venue/pos/end-of-day${date ? `?date=${encodeURIComponent(date)}` : ''}`,
} as const;

/**
 * Products and stock (`/api/venue/retail/*`, POS plan Appendix E #26 to #30). These go through
 * `posFetch` too, so they carry the same headers, and like every POS call they are only made at
 * venues with `pos_enabled`.
 */
export const retailPaths = {
  products: (params: { q?: string | null; archived?: 'live' | 'archived' | 'all'; low?: boolean; offset?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params.q?.trim()) sp.set('q', params.q.trim().slice(0, 120));
    if (params.archived && params.archived !== 'live') sp.set('archived', params.archived);
    if (params.low) sp.set('low', '1');
    sp.set('limit', String(params.limit ?? 50));
    if (params.offset) sp.set('offset', String(params.offset));
    return `/api/venue/retail/products?${sp.toString()}`;
  },
  productsCreate: '/api/venue/retail/products',
  product: (productId: string) => `/api/venue/retail/products/${encodeURIComponent(productId)}`,
  productPhotos: (productId: string) => `/api/venue/retail/products/${encodeURIComponent(productId)}/photos`,
  productPhoto: (productId: string, index: number) =>
    `/api/venue/retail/products/${encodeURIComponent(productId)}/photos/${index}`,
  named: (kind: 'brands' | 'categories' | 'suppliers') => `/api/venue/retail/${kind}`,
  stock: (params: { filter?: string; q?: string | null; offset?: number; tiles?: boolean }) => {
    const sp = new URLSearchParams();
    if (params.filter && params.filter !== 'all') sp.set('filter', params.filter);
    if (params.q?.trim()) sp.set('q', params.q.trim().slice(0, 120));
    sp.set('limit', '50');
    if (params.offset) sp.set('offset', String(params.offset));
    if (params.tiles) sp.set('tiles', '1');
    return `/api/venue/retail/stock?${sp.toString()}`;
  },
  adjustments: '/api/venue/retail/stock/adjustments',
  movements: (params: { variantId?: string | null; productId?: string | null; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params.variantId) sp.set('variant_id', params.variantId);
    if (params.productId) sp.set('product_id', params.productId);
    sp.set('limit', '50');
    if (params.offset) sp.set('offset', String(params.offset));
    return `/api/venue/retail/stock/movements?${sp.toString()}`;
  },
  stocktakes: '/api/venue/retail/stocktakes',
  stocktake: (id: string) => `/api/venue/retail/stocktakes/${encodeURIComponent(id)}`,
  stocktakeAction: (id: string, action: 'counts' | 'status' | 'commit' | 'cancel') =>
    `/api/venue/retail/stocktakes/${encodeURIComponent(id)}/${action}`,
  // Pass 5 (app step 4b): suppliers, purchase orders and professional use (#28, #31, #32).
  purchaseOrders: (params: { status?: string | null; supplierId?: string | null; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params.status && params.status !== 'all') sp.set('status', params.status);
    if (params.supplierId) sp.set('supplier_id', params.supplierId);
    sp.set('limit', '50');
    if (params.offset) sp.set('offset', String(params.offset));
    return `/api/venue/retail/purchase-orders?${sp.toString()}`;
  },
  purchaseOrdersCreate: '/api/venue/retail/purchase-orders',
  purchaseOrder: (id: string) => `/api/venue/retail/purchase-orders/${encodeURIComponent(id)}`,
  purchaseOrderAction: (id: string, action: 'send' | 'receive' | 'cancel' | 'suggest') =>
    `/api/venue/retail/purchase-orders/${encodeURIComponent(id)}/${action}`,
  purchaseOrderPdf: (id: string) => `/api/venue/retail/purchase-orders/${encodeURIComponent(id)}/pdf`,
  variants: (params: { q: string; purpose: 'use' | 'order'; supplierId?: string | null }) => {
    const sp = new URLSearchParams({ purpose: params.purpose, limit: '20' });
    if (params.q.trim()) sp.set('q', params.q.trim().slice(0, 100));
    if (params.supplierId) sp.set('supplier_id', params.supplierId);
    return `/api/venue/retail/variants?${sp.toString()}`;
  },
  usage: '/api/venue/retail/usage',
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

/**
 * Online orders (`/api/venue/shop/orders/**`, Pass 6a, app step 5). Through `posFetch` like every
 * POS call, so they carry the same headers, and only at venues with `pos_enabled`. The routes are
 * open with the shop switch off, so paid orders can still be fulfilled; each needs `manage_orders`.
 */
export const shopPaths = {
  orders: (params: { tab: string; q?: string | null; cursor?: string | null }) => {
    const sp = new URLSearchParams({ tab: params.tab });
    if (params.q?.trim()) sp.set('q', params.q.trim().slice(0, 80));
    if (params.cursor) sp.set('cursor', params.cursor);
    return `/api/venue/shop/orders?${sp.toString()}`;
  },
  badge: '/api/venue/shop/orders/badge',
  lookup: (code: string) => `/api/venue/shop/orders/lookup?code=${encodeURIComponent(code.slice(0, 12))}`,
  order: (id: string) => `/api/venue/shop/orders/${encodeURIComponent(id)}`,
  orderAction: (id: string, action: 'status' | 'cancel' | 'refund' | 'returns') =>
    `/api/venue/shop/orders/${encodeURIComponent(id)}/${action}`,
  orderReturn: (id: string, returnId: string) =>
    `/api/venue/shop/orders/${encodeURIComponent(id)}/returns/${encodeURIComponent(returnId)}`,
} as const;
