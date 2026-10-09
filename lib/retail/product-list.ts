import { parseMoneyInput } from '@/lib/pos/sale-math';
import type { ProductListFilters } from '@/lib/retail/stock-setup-paths';
import type { StockT } from '@/lib/retail/stock-setup-copy';
import type { RetailListProduct } from '@/types/retail';

/**
 * The pure parts of the products list (UX spec §6.1, §6.4), following the web's
 * `src/components/retail/products/list-model.ts`: the filters, what each row says about price and
 * stock, and the bulk price change with its preview.
 */

export const EMPTY_FILTERS: ProductListFilters = {
  q: '',
  category_id: '',
  brand_id: '',
  supplier_id: '',
  use: '',
  online: false,
  low: false,
  archived: false,
};

/** True when anything other than the search narrows the list. */
export function hasFilters(f: ProductListFilters): boolean {
  return Boolean(f.category_id || f.brand_id || f.supplier_id || f.use || f.online || f.low || f.archived);
}

/** How many filters are set, for the Filters button (the supplier and low ones only with Track stock on). */
export function filterCount(f: ProductListFilters, trackStock: boolean): number {
  return [f.category_id, f.brand_id, trackStock && f.supplier_id, f.use, f.online, trackStock && f.low, f.archived].filter(Boolean).length;
}

/** "£12.50", or "From £9" when the options differ in price. */
export function priceLabel(p: RetailListProduct, money: (pence: number) => string, t: StockT): string {
  const prices = p.variants.map((v) => v.price_pence);
  if (prices.length === 0) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : t('prod.row.from', { amount: money(min) });
}

/** `prod.row.stock`, `prod.row.out` or `prod.row.notTracked`. */
export function stockLabel(p: RetailListProduct, t: StockT): { text: string; tone: 'ok' | 'out' | 'none' } {
  const tracked = p.variants.filter((v) => v.track_stock);
  if (tracked.length === 0) return { text: t('prod.row.notTracked'), tone: 'none' };
  const count = tracked.reduce((n, v) => n + v.on_hand, 0);
  if (count <= 0) return { text: t('prod.row.out'), tone: 'out' };
  return { text: t('prod.row.stock', { count }), tone: 'ok' };
}

/** Any counted option at or below its reorder level. */
export function isLow(p: RetailListProduct): boolean {
  return p.variants.some((v) => v.track_stock && v.reorder_level !== null && v.on_hand <= v.reorder_level);
}

export type BulkWhich = 'retail' | 'cost';
export type BulkMode = 'increase' | 'decrease' | 'set';
export type BulkKind = 'percent' | 'amount';

export interface BulkPriceForm {
  which: BulkWhich;
  mode: BulkMode;
  kind: BulkKind;
  value: string;
}

/** A percentage typed as "10" or "12.5" in basis points, or null when it is not one. */
export function percentToBps(raw: string): number | null {
  const s = raw.trim().replace('%', '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const bps = Math.round(Number(s) * 100);
  return bps >= 1 && bps <= 100_000 ? bps : null;
}

/** Pence from a typed amount, or null when it is not one. */
export function amountToPence(raw: string): number | null {
  const pence = parseMoneyInput(raw);
  return pence != null && pence <= 2_000_000 ? pence : null;
}

/** The body `POST /api/venue/retail/products/bulk` takes, or null while the form is incomplete. */
export function bulkPriceBody(ids: string[], form: BulkPriceForm): Record<string, unknown> | null {
  if (ids.length === 0) return null;
  const kind: BulkKind = form.mode === 'set' ? 'amount' : form.kind;
  const base = { op: 'price', product_ids: ids, which: form.which, mode: form.mode };
  if (kind === 'percent') {
    const bps = percentToBps(form.value);
    return bps === null ? null : { ...base, percent_bps: bps };
  }
  const pence = amountToPence(form.value);
  return pence === null ? null : { ...base, amount_pence: pence };
}

/** The same sum `retail_bulk_edit` does, for the preview. */
export function applyPriceChange(current: number, body: Record<string, unknown>): number {
  const bps = typeof body.percent_bps === 'number' ? body.percent_bps : null;
  const amount = typeof body.amount_pence === 'number' ? body.amount_pence : 0;
  let next: number;
  if (body.mode === 'set') next = amount;
  else if (body.mode === 'increase') next = bps !== null ? Math.round((current * (10_000 + bps)) / 10_000) : current + amount;
  else next = bps !== null ? Math.round((current * Math.max(0, 10_000 - bps)) / 10_000) : current - amount;
  next = Math.max(0, next);
  return body.which === 'retail' ? Math.min(2_000_000, next) : next;
}

/** `bulk.price.preview`: how many prices change, with the first as the example. */
export function bulkPreview(
  products: RetailListProduct[],
  body: Record<string, unknown> | null,
  money: (pence: number) => string,
  t: StockT,
): string | null {
  if (!body) return null;
  const which = body.which as BulkWhich;
  const options = products.flatMap((p) =>
    p.variants
      .filter((v) => which === 'retail' || body.mode === 'set' || v.cost_pence !== null)
      .map((v) => ({ product: p.name, option: v.option_name, current: which === 'retail' ? v.price_pence : (v.cost_pence ?? 0) })),
  );
  if (options.length === 0) return t('x.bulk.noPrices');
  const first = options[0]!;
  const name = first.option ? `${first.product} ${first.option}` : first.product;
  const example = t('x.example', {
    product: name,
    from: money(Math.round(first.current)),
    to: money(Math.round(applyPriceChange(first.current, body))),
  });
  return t('bulk.price.preview', { count: options.length, example });
}
