/**
 * The app's product editor (POS app step 4, UX spec §6.2, §6.3; web `editor-model.ts`): the body
 * it sends, the stock fields only with Track stock on, an untouched average cost never sent back
 * rounded, the restriction ticks and the shop, and the server's field errors mapped to the form.
 */
import { barcodeProblem, BARCODE_CHECK_DIGIT_SENTENCE, detectSymbology, gs1CheckDigit } from '@/lib/retail/barcode';
import {
  buildProductBody,
  draftFromProduct,
  errorKeyForPath,
  newOption,
  sameDraft,
  serverFieldErrors,
} from '@/lib/retail/product-editor';
import type { RetailProduct } from '@/types/retail';

const words = {
  nameRequired: 'Give the product a name.',
  priceInvalid: 'Enter a price, like 12.50.',
  numberInvalid: 'Enter a whole number.',
  needOption: 'Add at least one option.',
  barcodeInvalid: "That barcode's check digit is wrong. Check it and try again.",
};

function saved(over: Partial<RetailProduct> = {}): RetailProduct {
  return {
    id: 'p1',
    name: 'Shampoo',
    slug: 'shampoo',
    brand_id: 'b1',
    brand_name: 'Kerastase',
    category_id: null,
    category_name: null,
    supplier_id: 'sup1',
    supplier_name: 'Wholesale Ltd',
    description: 'Keep me',
    photos: [],
    usage: 'retail',
    sold_in_store: true,
    sold_online: true,
    hygiene_sealed: true,
    tax_category: null,
    restriction: 'none',
    unit_price_basis: 'standard',
    manufacturer_name: null,
    manufacturer_address: null,
    manufacturer_contact: null,
    archived_at: null,
    version: 3,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    can_delete: false,
    variants: [
      {
        id: 'v1',
        option_name: null,
        sku: 'SH250',
        price_pence: 1800,
        cost_pence: 712.3456,
        net_quantity: 250,
        net_unit: 'ml',
        track_stock: true,
        reorder_level: 2,
        reorder_quantity: 6,
        order_up_to_level: null,
        pack_size: 6,
        sort_order: 0,
        archived_at: null,
        on_hand: 4,
        reserved: 0,
        barcodes: [{ barcode: '5012345678900', symbology: 'ean13' }],
      },
    ],
    ...over,
  };
}

describe('barcodes', () => {
  it('checks EAN-13 and UPC-A check digits and takes Code 128 as typed', () => {
    expect(gs1CheckDigit('501234567890')).toBe(0);
    expect(detectSymbology('5012345678900')).toBe('ean13');
    expect(detectSymbology('036000291452')).toBe('upca');
    expect(detectSymbology('ABC-123')).toBe('code128');
    expect(barcodeProblem('5012345678900')).toBeNull();
    expect(barcodeProblem('5012345678901')).toBe(BARCODE_CHECK_DIGIT_SENTENCE);
    expect(barcodeProblem('ABC-123')).toBeNull();
    expect(barcodeProblem('two words')).not.toBeNull();
  });
});

describe('a new product', () => {
  it('sends the fields the app shows, with the stock fields only while Track stock is on', () => {
    const d = draftFromProduct(null, true);
    d.name = '  Razor  ';
    d.age18 = true;
    d.options[0] = { ...d.options[0]!, price: '12.50', cost: '4', opening_quantity: '10', reorder_level: '2' };
    const built = buildProductBody(d, null, { trackStock: true, vatRegistered: false }, words);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.body).toMatchObject({ name: 'Razor', restriction: 'age_18', sold_online: false, usage: 'retail' });
    expect(built.body).not.toHaveProperty('tax_category');
    expect((built.body.variants as Record<string, unknown>[])[0]).toEqual({
      option_name: null,
      sku: null,
      price_pence: 1250,
      barcodes: [],
      sort_order: 0,
      cost_pence: 400,
      track_stock: true,
      reorder_level: 2,
      reorder_quantity: null,
      opening_quantity: 10,
    });

    const off = buildProductBody(d, null, { trackStock: false, vatRegistered: true }, words);
    expect(off.ok && (off.body.variants as Record<string, unknown>[])[0]).not.toHaveProperty('cost_pence');
    expect(off.ok && off.body.tax_category).toBeNull();
  });

  it('names what needs fixing', () => {
    const d = draftFromProduct(null, false);
    d.options[0] = { ...d.options[0]!, price: 'twelve', barcodes: [{ barcode: '5012345678901' }] };
    const built = buildProductBody(d, null, { trackStock: false, vatRegistered: false }, words);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    const key = d.options[0]!.key;
    expect(built.errors).toEqual({
      name: words.nameRequired,
      [`opt.${key}.price`]: words.priceInvalid,
      [`opt.${key}.barcodes`]: words.barcodeInvalid,
    });
  });
});

describe('editing a product', () => {
  it('leaves an untouched average cost alone, and sends a changed one', () => {
    const p = saved();
    const d = draftFromProduct(p, true);
    expect(d.options[0]!.cost).toBe('7.12');
    const untouched = buildProductBody(d, p, { trackStock: true, vatRegistered: false }, words);
    expect(untouched.ok && (untouched.body.variants as Record<string, unknown>[])[0]).not.toHaveProperty('cost_pence');
    d.options[0] = { ...d.options[0]!, cost: '8.00' };
    const changed = buildProductBody(d, p, { trackStock: true, vatRegistered: false }, words);
    expect(changed.ok && (changed.body.variants as Record<string, unknown>[])[0]).toMatchObject({ id: 'v1', cost_pence: 800 });
  });

  it('never sends what the app does not show, so the web-only fields stay as they are', () => {
    const p = saved();
    const built = buildProductBody(draftFromProduct(p, true), p, { trackStock: true, vatRegistered: false }, words);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    for (const key of ['description', 'supplier_id', 'hygiene_sealed', 'manufacturer_name', 'unit_price_basis', 'photos']) {
      expect(built.body).not.toHaveProperty(key);
    }
    const v = (built.body.variants as Record<string, unknown>[])[0]!;
    for (const key of ['net_quantity', 'net_unit', 'order_up_to_level', 'pack_size', 'opening_quantity']) {
      expect(v).not.toHaveProperty(key);
    }
  });

  it('archives a removed option, keeps a v1.x restriction, and keeps it off the shop', () => {
    const p = saved({ restriction: 'reportable', sold_online: false });
    const d = draftFromProduct(p, false);
    d.multi = true;
    d.options = [{ ...d.options[0]!, archived: true }, { ...newOption(false), option_name: 'Travel', price: '5' }];
    const built = buildProductBody(d, p, { trackStock: false, vatRegistered: false }, words);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.body).not.toHaveProperty('restriction');
    expect(built.body.sold_online).toBe(false);
    expect(built.body.variants).toEqual([
      { id: 'v1', archived: true },
      { option_name: 'Travel', sku: null, price_pence: 500, barcodes: [], sort_order: 0 },
    ]);
  });

  it('knows when nothing changed', () => {
    const p = saved();
    expect(sameDraft(draftFromProduct(p, true), draftFromProduct(p, true))).toBe(true);
  });
});

describe("the server's field errors", () => {
  it('map back to the option they name', () => {
    expect(errorKeyForPath('variants.1.sku', ['a', 'b'])).toBe('opt.b.sku');
    expect(errorKeyForPath('variants.0.barcodes.2', ['a'])).toBe('opt.a.barcodes');
    expect(errorKeyForPath('name', ['a'])).toBe('name');
    expect(
      serverFieldErrors({ error: 'Shampoo already uses the SKU SH250.', fields: [{ path: 'variants.0.sku', message: 'Shampoo already uses the SKU SH250.' }] }, ['k1']),
    ).toEqual({ 'opt.k1.sku': 'Shampoo already uses the SKU SH250.' });
  });
});
