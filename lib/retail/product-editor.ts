import { barcodeProblem, BARCODE_CHECK_DIGIT_SENTENCE, detectSymbology } from '@/lib/retail/barcode';
import { parseMoneyInput, penceToInput } from '@/lib/pos/sale-math';
import type { ProductUsage, RetailProduct, RetailVariant, Symbology, TaxCategory } from '@/types/retail';

/**
 * The app's product editor: its form state and the body it sends (POS plan P7-12; UX spec §6.2,
 * §6.3, §13.6), following the web's `src/components/retail/products/editor-model.ts`.
 *
 * The app edits what the spec gives it: the name, brand and category, how it is used, the two
 * restriction ticks, the VAT category, and per option the name, SKU, barcodes, price, cost, whether
 * it counts stock, the reorder level and quantity, and a new option's starting count. Everything
 * else (description, sizes, supplier, manufacturer details and so on) stays on the web: an edit
 * sends only the fields the app shows, and `retail_save_product` leaves a field it is not sent as
 * it was.
 *
 *   - "Not sold online" is `sold_online` false; "Age restricted (18+)" is `restriction` 'age_18'
 *     and also keeps it off the shop, as does backbar-only use (the database's CHECK).
 *   - With Track stock off the stock fields are neither shown nor sent (§9.16).
 *   - The average cost is kept to four decimals on the server and shown to the penny here, so the
 *     cost is sent only when it was typed: an untouched cost never rounds the average.
 */

export interface BarcodeDraft {
  barcode: string;
  symbology?: Symbology;
}

export interface OptionDraft {
  key: string;
  id: string | null;
  /** An existing option to archive in this save. */
  archived: boolean;
  option_name: string;
  sku: string;
  barcodes: BarcodeDraft[];
  price: string;
  cost: string;
  /** The cost as first shown, so an untouched average cost is not sent back rounded. */
  cost_initial: string;
  track_stock: boolean;
  reorder_level: string;
  reorder_quantity: string;
  opening_quantity: string;
  /** Read only, for the Stock section. */
  on_hand: number;
  reserved: number;
}

export interface ProductDraft {
  name: string;
  brand_id: string | null;
  category_id: string | null;
  usage: ProductUsage;
  sold_in_store: boolean;
  not_online: boolean;
  age18: boolean;
  tax_category: '' | TaxCategory;
  /** "This product comes in different sizes or shades". */
  multi: boolean;
  options: OptionDraft[];
}

export interface EditorContext {
  trackStock: boolean;
  vatRegistered: boolean;
}

/** The sentences the model shows, from the copy deck (passed in so this stays pure). */
export interface EditorWords {
  nameRequired: string;
  priceInvalid: string;
  numberInvalid: string;
  needOption: string;
  barcodeInvalid: string;
}

let keySeq = 0;
export function newKey(): string {
  keySeq += 1;
  return `opt-${keySeq}-${Math.random().toString(36).slice(2, 8)}`;
}

const text = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** Pence (four decimal places for a cost) as typed money, to the penny. */
export function costText(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return '';
  return penceToInput(Math.round(pence));
}

export function newOption(trackStock: boolean): OptionDraft {
  return {
    key: newKey(),
    id: null,
    archived: false,
    option_name: '',
    sku: '',
    barcodes: [],
    price: '',
    cost: '',
    cost_initial: '',
    // New options count stock once Track stock is on (UX spec §6.3 `var.track`).
    track_stock: trackStock,
    reorder_level: '',
    reorder_quantity: '',
    opening_quantity: '',
    on_hand: 0,
    reserved: 0,
  };
}

function optionFromVariant(v: RetailVariant): OptionDraft {
  const cost = costText(v.cost_pence);
  return {
    key: v.id,
    id: v.id,
    archived: false,
    option_name: text(v.option_name),
    sku: text(v.sku),
    barcodes: v.barcodes.map((b) => ({ barcode: b.barcode, symbology: b.symbology })),
    price: penceToInput(v.price_pence),
    cost,
    cost_initial: cost,
    track_stock: v.track_stock,
    reorder_level: text(v.reorder_level),
    reorder_quantity: text(v.reorder_quantity),
    opening_quantity: '',
    on_hand: v.on_hand,
    reserved: v.reserved,
  };
}

export function draftFromProduct(p: RetailProduct | null, trackStock: boolean): ProductDraft {
  if (!p) {
    return {
      name: '',
      brand_id: null,
      category_id: null,
      usage: 'retail',
      sold_in_store: true,
      not_online: false,
      age18: false,
      tax_category: '',
      multi: false,
      options: [newOption(trackStock)],
    };
  }
  // Archived options stay in the records; the editor shows the live ones.
  const options = p.variants
    .filter((v) => !v.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(optionFromVariant);
  return {
    name: p.name,
    brand_id: p.brand_id,
    category_id: p.category_id,
    usage: p.usage,
    sold_in_store: p.sold_in_store,
    not_online: !p.sold_online,
    age18: p.restriction === 'age_18',
    tax_category: p.tax_category ?? '',
    multi: options.length > 1,
    options: options.length ? options : [newOption(trackStock)],
  };
}

/** The live (not being archived) options. */
export function liveOptions(d: ProductDraft): OptionDraft[] {
  return d.options.filter((o) => !o.archived);
}

export type FieldErrors = Record<string, string>;

export type BuildResult =
  | { ok: true; body: Record<string, unknown>; variantKeys: string[] }
  | { ok: false; errors: FieldErrors };

function whole(raw: string, min: number): number | null | 'bad' {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return 'bad';
  const n = Number(t);
  return n < min || n > 1_000_000 ? 'bad' : n;
}

function nullable(raw: string): string | null {
  const t = raw.trim();
  return t ? t : null;
}

/** The barcode's problem, with the deck's sentence for a wrong check digit. */
export function barcodeError(b: BarcodeDraft, words: Pick<EditorWords, 'barcodeInvalid'>): string | null {
  const problem = barcodeProblem(b.barcode, b.symbology ?? detectSymbology(b.barcode));
  if (!problem) return null;
  return problem === BARCODE_CHECK_DIGIT_SENTENCE ? words.barcodeInvalid : problem;
}

/**
 * Checks the form and builds the create or edit body (without `client_request_id` or `version`,
 * which the caller adds). `initial` is the product as loaded, or null for a new one. Field errors
 * are keyed `name` and `opt.<key>.<field>`.
 */
export function buildProductBody(
  d: ProductDraft,
  initial: RetailProduct | null,
  ctx: EditorContext,
  words: EditorWords,
): BuildResult {
  const errors: FieldErrors = {};
  const name = d.name.trim();
  if (!name) errors.name = words.nameRequired;
  else if (name.length > 120) errors.name = 'Keep the name to 120 characters or fewer.';

  const variants: Record<string, unknown>[] = [];
  const variantKeys: string[] = [];
  let sort = 0;
  for (const o of d.options) {
    if (o.archived) {
      if (o.id) {
        variants.push({ id: o.id, archived: true });
        variantKeys.push(o.key);
      }
      continue;
    }
    const e = (field: string, message: string) => {
      errors[`opt.${o.key}.${field}`] = message;
    };
    const v: Record<string, unknown> = {};
    if (o.id) v.id = o.id;
    v.option_name = d.multi || o.id ? nullable(o.option_name) : null;
    v.sku = nullable(o.sku);
    if (o.sku.trim().length > 64) e('sku', 'Keep the SKU to 64 characters or fewer.');

    const price = parseMoneyInput(o.price);
    if (price == null || price > 2_000_000) e('price', words.priceInvalid);
    else v.price_pence = price;

    const barcodes: Record<string, unknown>[] = [];
    for (const b of o.barcodes) {
      const problem = barcodeError(b, words);
      if (problem) e('barcodes', problem);
      barcodes.push(b.symbology ? { barcode: b.barcode.trim(), symbology: b.symbology } : { barcode: b.barcode.trim() });
    }
    v.barcodes = barcodes;
    v.sort_order = sort;
    sort += 1;

    if (ctx.trackStock) {
      if (o.cost.trim() !== o.cost_initial.trim() || !o.id) {
        if (!o.cost.trim()) {
          if (o.id) v.cost_pence = null;
        } else {
          const cost = parseMoneyInput(o.cost);
          if (cost == null || cost > 2_000_000) e('cost', words.priceInvalid);
          else v.cost_pence = cost;
        }
      }
      v.track_stock = o.track_stock;
      const level = whole(o.reorder_level, 0);
      if (level === 'bad') e('reorder_level', words.numberInvalid);
      else v.reorder_level = level;
      const qty = whole(o.reorder_quantity, 1);
      if (qty === 'bad') e('reorder_quantity', words.numberInvalid);
      else v.reorder_quantity = qty;
      if (!o.id && o.track_stock) {
        const opening = whole(o.opening_quantity, 0);
        if (opening === 'bad') e('opening_quantity', words.numberInvalid);
        else if (opening !== null && opening > 0) v.opening_quantity = opening;
      }
    }
    variants.push(v);
    variantKeys.push(o.key);
  }
  if (liveOptions(d).length === 0) errors.options = words.needOption;

  if (Object.keys(errors).length) return { ok: false, errors };

  const body: Record<string, unknown> = {
    name,
    brand_id: d.brand_id,
    category_id: d.category_id,
    usage: d.usage,
    sold_in_store: d.sold_in_store,
    sold_online: !(d.not_online || d.age18 || d.usage === 'professional'),
    variants,
  };
  // v1 shows "none" and "age_18" only; a v1.x restriction already on the product is left alone,
  // and keeps it out of the shop as the database requires.
  if (d.age18) body.restriction = 'age_18';
  else if (!initial || initial.restriction === 'age_18' || initial.restriction === 'none') body.restriction = 'none';
  else body.sold_online = false;
  if (ctx.vatRegistered) body.tax_category = d.tax_category || null;
  return { ok: true, body, variantKeys };
}

/** A server field path (`variants.2.sku`, `variants.0.barcodes.1`, `name`) as an editor error key. */
export function errorKeyForPath(path: string, variantKeys: string[]): string {
  const m = /^variants\.(\d+)(?:\.([a-z_]+))?/.exec(path);
  if (!m) return path.split('.')[0] ?? path;
  const key = variantKeys[Number(m[1])];
  if (!key) return 'options';
  return `opt.${key}.${m[2] ?? 'sku'}`;
}

/** The field errors a 400 `VALIDATION_FAILED` names (`details.fields[]` or `fields[]`), as editor keys. */
export function serverFieldErrors(body: unknown, variantKeys: string[]): FieldErrors {
  const out: FieldErrors = {};
  if (!body || typeof body !== 'object') return out;
  const b = body as { fields?: unknown; details?: { fields?: unknown } };
  const fields = Array.isArray(b.fields) ? b.fields : Array.isArray(b.details?.fields) ? b.details.fields : [];
  for (const f of fields as { path?: unknown; message?: unknown }[]) {
    if (typeof f?.path !== 'string' || typeof f.message !== 'string') continue;
    const key = errorKeyForPath(f.path, variantKeys);
    if (!out[key]) out[key] = f.message;
  }
  return out;
}

/** Two drafts hold the same values (the unsaved-changes guard). */
export function sameDraft(a: ProductDraft, b: ProductDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
