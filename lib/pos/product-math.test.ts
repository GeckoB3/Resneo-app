/**
 * Products at the till (POS app step 4, UX spec §3.7, §3.8, §3.22; web `product-types.ts`): the
 * stock warnings of D15, the tile hint, the favourites grid with product tiles, a product line's
 * chips, and which refunded lines can go back in stock.
 */
import {
  canRestock,
  checkStock,
  DEFAULT_STOCK_RULES,
  isAgeRestrictedLine,
  looksLikeBarcode,
  optionLabel,
  productLineStock,
  productPrice,
  quantityOnSale,
  readStockRules,
  refundLinesBody,
  resolveTillFavourites,
  stockHint,
} from '@/lib/pos/product-math';
import { makeLine } from '@/lib/pos/test-sale';
import type { PosCatalogueProduct, PosCatalogueService } from '@/types/pos';

const on = { track_stock: true, sell_beyond_stock: true };
const strict = { track_stock: true, sell_beyond_stock: false };

function product(over: Partial<PosCatalogueProduct> = {}): PosCatalogueProduct {
  return {
    id: 'p1',
    name: 'Shampoo',
    brand_name: 'Kerastase',
    restriction: 'none',
    options: [{ id: 'v1', name: '250 ml', sku: 'SH250', price_pence: 1800, track_stock: true, on_hand: 4, available: 4 }],
    ...over,
  };
}

describe('the stock rules', () => {
  it('reads a server before Pass 4 as Track stock off and selling beyond the count on', () => {
    expect(readStockRules(undefined)).toEqual(DEFAULT_STOCK_RULES);
    expect(readStockRules({ track_stock: true })).toEqual({ track_stock: true, sell_beyond_stock: true });
  });
});

describe('checkStock (D15)', () => {
  const opt = { track_stock: true, on_hand: 2, available: 1 };
  it('never warns with Track stock off, or for an option that does not count stock', () => {
    expect(checkStock(opt, 0, 5, DEFAULT_STOCK_RULES)).toEqual({ kind: 'ok' });
    expect(checkStock({ ...opt, track_stock: false }, 0, 5, on)).toEqual({ kind: 'ok' });
  });
  it('warns when the count would go below zero, saying how many were left', () => {
    expect(checkStock(opt, 1, 2, on)).toEqual({ kind: 'over', left: 1 });
  });
  it('warns when what is left is held for online customers', () => {
    expect(checkStock(opt, 1, 1, on)).toEqual({ kind: 'reserved', held: 1 });
  });
  it('blocks when the venue does not sell beyond its count and none is available', () => {
    expect(checkStock(opt, 1, 1, strict)).toEqual({ kind: 'blocked' });
    expect(checkStock(opt, 0, 1, strict)).toEqual({ kind: 'ok' });
  });
  it('counts what the sale already holds, less what was refunded', () => {
    const lines = [
      makeLine({ id: 'a', line_type: 'product', variant_id: 'v1', quantity: 3, refunded_quantity: 1 }),
      makeLine({ id: 'b', line_type: 'service', variant_id: 'v1', quantity: 9 }),
    ];
    expect(quantityOnSale(lines, 'v1')).toBe(2);
  });
});

describe('the tile', () => {
  it('shows a hint only when every option counts stock, and only when few are left', () => {
    expect(stockHint(product(), on)).toEqual({ kind: 'left', count: 4 });
    expect(stockHint(product({ options: [{ ...product().options[0]!, available: 0 }] }), on)).toEqual({ kind: 'out', count: 0 });
    expect(stockHint(product({ options: [{ ...product().options[0]!, available: 40 }] }), on)).toBeNull();
    expect(stockHint(product(), DEFAULT_STOCK_RULES)).toBeNull();
  });
  it('shows "From" when the options cost different amounts', () => {
    const two = product({ options: [...product().options, { ...product().options[0]!, id: 'v2', price_pence: 3000 }] });
    expect(productPrice(two, (p) => `£${p / 100}`, (a) => `From ${a}`)).toBe('From £18');
    expect(productPrice(product(), (p) => `£${p / 100}`, (a) => `From ${a}`)).toBe('£18');
    expect(optionLabel(product(), product().options[0])).toBe('Shampoo, 250 ml');
  });
  it('takes a scanner code, not a word', () => {
    expect(looksLikeBarcode('5012345678900')).toBe(true);
    expect(looksLikeBarcode('SH250')).toBe(true);
    expect(looksLikeBarcode('shampoo')).toBe(false);
    expect(looksLikeBarcode('50 12')).toBe(false);
  });
});

describe('the favourites grid', () => {
  const service: PosCatalogueService = {
    id: 's1',
    name: 'Cut',
    description: null,
    category_id: null,
    colour: null,
    price_pence: 4000,
    price_type: null,
    duration_minutes: 30,
    options: [{ id: 'so1', name: 'Long', price_pence: 5000, duration_minutes: 45 }],
    calendars: [],
  };
  it('names services and product options in the venue order, and drops what no longer resolves', () => {
    const grid = resolveTillFavourites({
      services: [service],
      favourites: [
        { id: 'f1', item_type: 'variant', item_id: 'v1', sort_order: 0 },
        { id: 'f2', item_type: 'service', item_id: 's1', sort_order: 1 },
        { id: 'f3', item_type: 'variant', item_id: 'so1', sort_order: 2 },
        { id: 'f4', item_type: 'variant', item_id: 'gone', sort_order: 3 },
      ],
      favourite_products: [product()],
    });
    expect(grid.suggested).toBe(false);
    expect(grid.tiles.map((x) => [x.kind, x.name, x.price_pence])).toEqual([
      ['product', 'Shampoo, 250 ml', 1800],
      ['service', 'Cut', 4000],
      ['service', 'Cut, Long', 5000],
    ]);
  });
  it('starts from the best sellers until favourites are chosen', () => {
    const grid = resolveTillFavourites({
      services: [service],
      favourites: [],
      suggested: [{ item_type: 'variant', item_id: 'v1' }],
      favourite_products: [product()],
    });
    expect(grid.suggested).toBe(true);
    expect(grid.tiles).toHaveLength(1);
  });
});

describe("a product line's chips", () => {
  const line = makeLine({
    line_type: 'product',
    variant_id: 'v1',
    quantity: 2,
    product: { track_stock: true, on_hand: 1, available: 1, restriction: 'age_18' },
  });
  it('says the count goes below zero, or how few are left, while the sale can change', () => {
    expect(productLineStock(line, 'open')).toEqual({ kind: 'none' });
    expect(productLineStock({ ...line, quantity: 1 }, 'part_paid')).toEqual({ kind: 'low', count: 0 });
    expect(productLineStock(line, 'completed')).toBeNull();
    expect(productLineStock({ ...line, product: { ...line.product!, track_stock: false } }, 'open')).toBeNull();
  });
  it('marks an age restricted product with the 18+ chip', () => {
    expect(isAgeRestrictedLine(line)).toBe(true);
    expect(isAgeRestrictedLine({ ...line, product: { ...line.product!, restriction: 'none' } })).toBe(false);
  });
});

describe('putting refunded products back in stock (P4-10)', () => {
  const productLine = makeLine({ id: 'p', line_type: 'product', variant_id: 'v1', product: { track_stock: true, on_hand: 1, available: 1, restriction: 'none' } });
  const untracked = makeLine({ id: 'u', line_type: 'product', variant_id: 'v2', product: { track_stock: false, on_hand: 0, available: 0, restriction: 'none' } });
  const older = makeLine({ id: 'o', line_type: 'product', variant_id: 'v3' });
  const service = makeLine({ id: 's', line_type: 'service' });
  it('offers it for product lines that count stock (and for a sale read before Pass 4)', () => {
    expect(canRestock(productLine)).toBe(true);
    expect(canRestock(older)).toBe(true);
    expect(canRestock(untracked)).toBe(false);
    expect(canRestock(service)).toBe(false);
  });
  it('sends restock only for the lines ticked that can take it, unticked by default', () => {
    const lines = [productLine, untracked, service];
    expect(refundLinesBody(lines, { p: 1, u: 1, s: 1 }, new Set(['p', 'u', 's']))).toEqual([
      { line_id: 'p', quantity: 1, restock: true },
      { line_id: 'u', quantity: 1 },
      { line_id: 's', quantity: 1 },
    ]);
    expect(refundLinesBody(lines, { p: 2, u: 0 }, new Set())).toEqual([{ line_id: 'p', quantity: 2 }]);
  });
});
