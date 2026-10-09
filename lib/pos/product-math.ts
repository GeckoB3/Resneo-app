import type {
  PosCatalogue,
  PosCatalogueProduct,
  PosCatalogueProductOption,
  PosCatalogueService,
  PosSaleLine,
  PosStockRules,
} from '@/types/pos';

/**
 * Products at the till in the app (POS plan §4.12, §4.13, P4-4; UX spec §3.7, §3.8, §3.22), ported
 * from the web till's `src/components/pos/products/product-types.ts` and `ProductLineChips.tsx`:
 * the stock rules, the tile's stock hint, the warning a product gets when it is added, the
 * favourites grid with product tiles, the chips of a product line, and which refunded lines can go
 * back in stock. Pure, so the rules are tested apart from the screens.
 */

/** Track stock off and selling beyond the count on: what a server before Pass 4 implies. */
export const DEFAULT_STOCK_RULES: PosStockRules = { track_stock: false, sell_beyond_stock: true };

/** The catalogue's stock rules; anything missing reads as the defaults. */
export function readStockRules(raw: Partial<PosStockRules> | null | undefined): PosStockRules {
  if (!raw || typeof raw !== 'object') return DEFAULT_STOCK_RULES;
  return { track_stock: raw.track_stock === true, sell_beyond_stock: raw.sell_beyond_stock !== false };
}

/**
 * A scan looks like a barcode: one word of printable characters with a digit in it. A
 * keyboard-mode scanner types it into the focused field and ends with Enter.
 */
export function looksLikeBarcode(value: string): boolean {
  return /^[\x21-\x7E]{4,64}$/.test(value) && /\d/.test(value);
}

/** "Product, option" as people read it. */
export function optionLabel(
  product: Pick<PosCatalogueProduct, 'name'>,
  option: Pick<PosCatalogueProductOption, 'name'> | null | undefined,
): string {
  return option?.name ? `${product.name}, ${option.name}` : product.name;
}

/** "From £x" when the options' prices differ, else the one price. */
export function productPrice(
  product: PosCatalogueProduct,
  money: (pence: number) => string,
  from: (amount: string) => string,
): string {
  const prices = product.options.map((o) => o.price_pence);
  if (prices.length === 0) return '';
  const min = Math.min(...prices);
  return prices.length > 1 && min !== Math.max(...prices) ? from(money(min)) : money(min);
}

/** The tile's stock hint (UX spec §3.8 `add.stock.left`, `add.stock.out`), only for counted options. */
export function stockHint(product: PosCatalogueProduct, rules: PosStockRules): { kind: 'left' | 'out'; count: number } | null {
  if (!rules.track_stock) return null;
  const counted = product.options.filter((o) => o.track_stock);
  if (counted.length === 0 || counted.length !== product.options.length) return null;
  const left = counted.reduce((sum, o) => sum + Math.max(o.available, 0), 0);
  if (left <= 0) return { kind: 'out', count: 0 };
  return left <= 5 ? { kind: 'left', count: left } : null;
}

export type StockCheck =
  | { kind: 'ok' }
  /** Selling it takes the count below zero: allowed, with `add.stock.warnOver`. */
  | { kind: 'over'; left: number }
  /** What is left is held for online customers: allowed, with `add.stock.warnReserved`. */
  | { kind: 'reserved'; held: number }
  /** The venue does not sell beyond its count and none is available: `err.stock.none`. */
  | { kind: 'blocked' };

/**
 * What adding `adding` more of an option means, given what the sale already has of it (UX spec
 * §3.8, D15, plan §4.13 and §4.32 row 97). Options that do not count stock, and venues with Track
 * stock off, never warn. The server checks again under its lock; this only says it first.
 */
export function checkStock(
  option: Pick<PosCatalogueProductOption, 'track_stock' | 'on_hand' | 'available'>,
  onSale: number,
  adding: number,
  rules: PosStockRules,
): StockCheck {
  if (!rules.track_stock || !option.track_stock) return { kind: 'ok' };
  const want = onSale + adding;
  if (!rules.sell_beyond_stock) return option.available >= want ? { kind: 'ok' } : { kind: 'blocked' };
  if (option.on_hand < want) return { kind: 'over', left: Math.max(option.on_hand - onSale, 0) };
  if (option.available < want) return { kind: 'reserved', held: Math.max(option.on_hand - Math.max(option.available, 0), 0) };
  return { kind: 'ok' };
}

/** How many of an option the sale already has. */
export function quantityOnSale(lines: PosSaleLine[], optionId: string): number {
  return lines
    .filter((l) => l.line_type === 'product' && l.variant_id === optionId)
    .reduce((sum, l) => sum + l.quantity - l.refunded_quantity, 0);
}

/** A tile of the favourites grid: a service (opens "Who did this service?") or a product option. */
export type TillFavourite =
  | { key: string; kind: 'service'; service: PosCatalogueService; optionId: string | null; name: string; price_pence: number | null }
  | {
      key: string;
      kind: 'product';
      product: PosCatalogueProduct;
      option: PosCatalogueProductOption;
      name: string;
      price_pence: number;
    };

/**
 * The favourites grid in the venue's order (UX spec §3.8): services named from the services list,
 * product options from `favourite_products`. Until favourites are chosen, the best sellers in
 * `suggested`. Anything that no longer resolves (an archived product or service) drops out.
 */
export function resolveTillFavourites(
  catalogue: Pick<PosCatalogue, 'services' | 'favourites' | 'favourite_products' | 'suggested'> | null | undefined,
): { tiles: TillFavourite[]; suggested: boolean } {
  if (!catalogue) return { tiles: [], suggested: false };
  const favourites = catalogue.favourites ?? [];
  const suggested = catalogue.suggested ?? [];
  const usingSuggested = favourites.length === 0 && suggested.length > 0;
  const source: { id?: string; item_type: 'service' | 'variant'; item_id: string }[] = usingSuggested ? suggested : favourites;
  const products = catalogue.favourite_products ?? [];
  const services = catalogue.services ?? [];
  const tiles: TillFavourite[] = [];
  source.forEach((f, index) => {
    const key = f.id ?? `fav-${index}`;
    if (f.item_type === 'variant') {
      // A 'variant' is a product option, or else one of a service's options (the web's order).
      const product = products.find((p) => p.options.some((o) => o.id === f.item_id));
      const option = product?.options.find((o) => o.id === f.item_id);
      if (product && option) {
        tiles.push({ key, kind: 'product', product, option, name: optionLabel(product, option), price_pence: option.price_pence });
        return;
      }
    } else if (f.item_type !== 'service') {
      return;
    }
    const service =
      f.item_type === 'service'
        ? services.find((s) => s.id === f.item_id)
        : services.find((s) => s.options.some((o) => o.id === f.item_id));
    if (!service) return;
    const option = f.item_type === 'variant' ? (service.options.find((o) => o.id === f.item_id) ?? null) : null;
    tiles.push({
      key,
      kind: 'service',
      service,
      optionId: option?.id ?? null,
      name: option?.name ? `${service.name}, ${option.name}` : service.name,
      price_pence: option?.price_pence ?? service.price_pence,
    });
  });
  return { tiles, suggested: usingSuggested };
}

/** How few left after this line counts as low on the line's chip. */
export const LOW_STOCK_CHIP = 3;

/**
 * A product line's stock chip (UX spec §3.7): while the sale can still change, for an option that
 * counts stock, `line.chip.stockNone` when selling it takes the count below zero, or
 * `line.chip.stockLow` when only a few will be left.
 */
export function productLineStock(
  line: Pick<PosSaleLine, 'line_type' | 'quantity' | 'product'>,
  saleStatus: string,
): { kind: 'none' } | { kind: 'low'; count: number } | null {
  const p = line.product;
  if (line.line_type !== 'product' || !p?.track_stock || (saleStatus !== 'open' && saleStatus !== 'part_paid')) return null;
  const left = p.on_hand - line.quantity;
  if (left < 0) return { kind: 'none' };
  return left <= LOW_STOCK_CHIP ? { kind: 'low', count: left } : null;
}

/** An age restricted product's line shows `line.chip.age18` (§3.26: a reminder, nothing recorded). */
export function isAgeRestrictedLine(line: Pick<PosSaleLine, 'line_type' | 'product'>): boolean {
  return line.line_type === 'product' && line.product?.restriction === 'age_18';
}

/**
 * Whether a refunded line can go back in stock (UX spec §3.22 `refund.restock`, P4-10): a product
 * line whose option counts stock. A sale read before Pass 4 has no stock facts on its lines, so a
 * product line then still offers it, as on the web.
 */
export function canRestock(line: Pick<PosSaleLine, 'line_type' | 'variant_id' | 'product'>): boolean {
  return line.line_type === 'product' && Boolean(line.variant_id) && line.product?.track_stock !== false;
}

/** The refund body's `lines`: each chosen line with its quantity, and `restock` only where asked. */
export function refundLinesBody(
  lines: Pick<PosSaleLine, 'id' | 'line_type' | 'variant_id' | 'product'>[],
  chosen: Record<string, number>,
  restock: ReadonlySet<string>,
): { line_id: string; quantity: number; restock?: true }[] {
  return Object.entries(chosen)
    .filter(([, q]) => q > 0)
    .map(([line_id, quantity]) => {
      const line = lines.find((l) => l.id === line_id);
      return { line_id, quantity, ...(line && canRestock(line) && restock.has(line_id) ? { restock: true as const } : {}) };
    });
}
