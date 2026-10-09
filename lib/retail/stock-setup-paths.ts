/**
 * The web routes the products and stock set-up screens call (all under `posRoute`, so a Bearer
 * call from the app works as the web's cookie one does), beside the paths `lib/pos/api.ts` already
 * has. Every value is encoded, and empty values are left out.
 */

export interface ProductListFilters {
  q: string;
  category_id: string;
  brand_id: string;
  supplier_id: string;
  use: '' | 'retail' | 'professional' | 'both';
  online: boolean;
  low: boolean;
  archived: boolean;
}

export interface MovementFilters {
  variantId?: string | null;
  productId?: string | null;
  reason?: string | null;
  from?: string | null;
  to?: string | null;
}

function qs(params: Record<string, string | number | null | undefined | false>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const PRODUCT_PAGE = 50;

export const stockSetupPaths = {
  /** The products list with the web's filters (`list-model.ts` `listUrl`). */
  productList: (f: ProductListFilters, offset: number, trackStock: boolean) =>
    `/api/venue/retail/products${qs({
      q: f.q.trim().slice(0, 120),
      category_id: f.category_id,
      brand_id: f.brand_id,
      supplier_id: trackStock ? f.supplier_id : '',
      use: f.use,
      online: f.online ? '1' : '',
      low: trackStock && f.low ? '1' : '',
      archived: f.archived ? 'archived' : '',
      limit: PRODUCT_PAGE,
      offset,
    })}`,
  /** How many products the venue has, archived or not (the first-product prompt). */
  productCount: '/api/venue/retail/products?archived=all&limit=1',
  productsBulk: '/api/venue/retail/products/bulk',
  productsExport: (archived: boolean) => `/api/venue/retail/products/export${archived ? '?archived=1' : ''}`,
  productImport: '/api/venue/retail/import',
  named: (kind: 'brands' | 'categories' | 'suppliers') => `/api/venue/retail/${kind}`,
  supplier: (id: string) => `/api/venue/retail/suppliers/${encodeURIComponent(id)}`,
  ordersBySupplier: '/api/venue/retail/purchase-orders/by-supplier',
  lowStock: '/api/venue/retail/stock/low?limit=50',
  movements: (f: MovementFilters, offset: number, limit = 50) =>
    `/api/venue/retail/stock/movements${qs({
      variant_id: f.variantId,
      product_id: f.variantId ? null : f.productId,
      reason: f.reason,
      from: f.from,
      to: f.to,
      limit,
      offset,
    })}`,
  movementsCsv: (f: MovementFilters) =>
    `/api/venue/retail/stock/movements${qs({
      variant_id: f.variantId,
      product_id: f.variantId ? null : f.productId,
      reason: f.reason,
      from: f.from,
      to: f.to,
      format: 'csv',
    })}`,
  stockReport: (from: string, to: string, asOf: string | null) => `/api/venue/retail/reports/stock${qs({ from, to, as_of: asOf })}`,
  stockReportCsv: (from: string, to: string, card: string) => `/api/venue/retail/reports/stock${qs({ from, to, format: 'csv', card })}`,
  purchasingReport: (from: string, to: string) => `/api/venue/retail/reports/purchasing${qs({ from, to })}`,
  purchasingReportCsv: (from: string, to: string, card: 'open' | 'received') =>
    `/api/venue/retail/reports/purchasing${qs({ from, to, format: 'csv', card })}`,
  stocktakes: (offset: number) => `/api/venue/retail/stocktakes${qs({ limit: 50, offset })}`,
  posSettings: '/api/venue/pos/settings',
  trackAll: '/api/venue/retail/stock/track-all',
} as const;
