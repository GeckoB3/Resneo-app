import { barcodeProblem, detectSymbology } from '@/lib/retail/barcode';
import type { ProductAiDraft, ProductAiDraftLevel, ProductAiExtractRequest, ProductAiExtractResponse } from '@/types/pos-setup';

import { aiCount, aiT, reviewText, AI_REVIEW } from './copy';

/**
 * "Add products with AI" in the app as plain functions (POS test round 2026-10-11, Part 4, OB7;
 * design section 6.7; contract `types/pos-setup.ts`). Each part mirrors the web's module of the same
 * job, rule for rule, so the web and the app review, merge and add a product the same way:
 *
 * - money as typed: `src/lib/money/price-input.ts` (`parsePriceInput`);
 * - the review notes and levels: `src/lib/retail/ai-import/review.ts` (`reviewProduct`), the rules
 *   the server used for each draft's `level` and `notes`;
 * - the editable drafts, merging what several sources found, and the products route body:
 *   `src/lib/retail/ai-import/draft-state.ts`;
 * - the sources and their requests: `src/components/retail/ai-import/sources.ts`.
 *
 * Nothing here talks to the server.
 */

// ─── Limits (the web's) ─────────────────────────────────────────────────────

/** Things waiting to be read at once. */
export const MAX_SOURCES = 12;
/** Sources read at the same time. */
export const READ_CONCURRENCY = 2;
/** A typed list (the route's own limit). */
export const MAX_TEXT_CHARS = 120_000;
/** The most a product can cost or sell for, as the products API allows (pence). */
export const PRODUCT_AI_MAX_PENCE = 2_000_000;
export const DRAFT_MAX_OPTIONS = 30;
const MAX_NOTES = 4;

// ─── Money as typed ─────────────────────────────────────────────────────────

/** The most one amount typed into a price box can be (the web's `MAX_PRICE_PENCE`). */
export const MAX_PRICE_PENCE = 10_000_000;

export type ParsedPriceInput = { kind: 'empty' } | { kind: 'ok'; pence: number } | { kind: 'invalid' };

/**
 * An amount as people type it: "25", "25.5", "£25.50", "1,250" or "25,50" (the web's
 * `parsePriceInput`). Blank is `empty`; a minus sign, more than two decimal places and anything
 * over the cap are `invalid`.
 */
export function parsePriceInput(raw: string | null | undefined): ParsedPriceInput {
  let s = String(raw ?? '')
    .trim()
    .replace(/[£$€\s]/g, '');
  if (!s) return { kind: 'empty' };
  let negative = false;
  if (/^[-\u2212]/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) s = s.replace(/,/g, '');
  const match = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!match || (!match[1] && !match[2])) return { kind: 'invalid' };
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/, '') || '0';
  const fraction = match[2] ?? '';
  if (fraction.length > 2) return { kind: 'invalid' };
  if (whole.length > 9) return { kind: 'invalid' };
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (negative && pence > 0) return { kind: 'invalid' };
  if (pence > MAX_PRICE_PENCE) return { kind: 'invalid' };
  return { kind: 'ok', pence };
}

/** An amount box: blank, a price the products API accepts, or not a number. */
export type MoneyValue = { kind: 'empty' } | { kind: 'ok'; pence: number } | { kind: 'invalid' };

export function moneyValueOfInput(raw: string): MoneyValue {
  const parsed = parsePriceInput(raw);
  if (parsed.kind === 'empty') return { kind: 'empty' };
  if (parsed.kind === 'ok' && parsed.pence <= PRODUCT_AI_MAX_PENCE) return { kind: 'ok', pence: parsed.pence };
  return { kind: 'invalid' };
}

/** Pence as a box shows them ("18.50"). */
export function penceToInput(pence: number | null): string {
  return pence === null ? '' : (pence / 100).toFixed(2);
}

// ─── The review ─────────────────────────────────────────────────────────────

export type ProductAiUsage = ProductAiDraft['usage'];
export type ReviewNoteLevel = 'fix' | 'check' | 'info';
export type ReviewNoteKind =
  | 'name_missing'
  | 'price_missing'
  | 'price_invalid'
  | 'cost_invalid'
  | 'option_name_missing'
  | 'option_name_repeated'
  | 'barcode_invalid'
  | 'barcode_repeated'
  | 'price_maybe_trade'
  | 'usage_guess'
  | 'duplicate'
  | 'cost_above_price'
  | 'note';

export interface ReviewNote {
  level: ReviewNoteLevel;
  kind: ReviewNoteKind;
  text: string;
}

export interface ReviewInput {
  name: string;
  usage: ProductAiUsage;
  options: { name: string; price: MoneyValue; cost: MoneyValue; barcode: string }[];
  /** The source showed one price that may be what the venue pays, not what it sells for. */
  priceMaybeTrade: boolean;
  /** The reader guessed "for treatments only" and the owner has not chosen yet. */
  usageGuessed: boolean;
  /** The venue already has a product like this one. */
  duplicate: boolean;
  /** The reader's own notes, shown as `info`. */
  notes: string[];
}

/** "Option 2" for an option with no name yet. */
export function optionLabel(name: string, index: number): string {
  return name.trim() || reviewText('optionLabel', { n: index + 1 });
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/**
 * Every note for one product, `fix` first, then `check`, then `info` (the server's rules): a
 * product sold at the till needs a selling price, so a missing one is a `fix`; a product for
 * treatments only is never sold, so its price may be blank.
 */
export function reviewProduct(input: ReviewInput): ReviewNote[] {
  const fix: ReviewNote[] = [];
  const check: ReviewNote[] = [];
  const many = input.options.length > 1;
  const sold = input.usage !== 'backbar';

  if (!input.name.trim()) fix.push({ level: 'fix', kind: 'name_missing', text: AI_REVIEW.nameMissing });

  const seenNames = new Map<string, number>();
  const seenCodes = new Set<string>();
  const repeatedCodes = new Set<string>();
  input.options.forEach((o, i) => {
    const label = optionLabel(o.name, i);
    if (many) {
      const key = o.name.trim().toLowerCase();
      if (!key) {
        fix.push({ level: 'fix', kind: 'option_name_missing', text: reviewText('optionNameMissing', { n: i + 1 }) });
      } else if (seenNames.has(key)) {
        if (seenNames.get(key) === 1) {
          fix.push({ level: 'fix', kind: 'option_name_repeated', text: reviewText('optionNameRepeated', { name: o.name.trim() }) });
        }
        seenNames.set(key, (seenNames.get(key) ?? 1) + 1);
      } else {
        seenNames.set(key, 1);
      }
    }

    if (o.price.kind === 'invalid') {
      fix.push({
        level: 'fix',
        kind: 'price_invalid',
        text: many ? reviewText('priceInvalidOption', { option: label }) : AI_REVIEW.priceInvalid,
      });
    } else if (o.price.kind === 'empty' && sold) {
      fix.push({
        level: 'fix',
        kind: 'price_missing',
        text: many ? reviewText('priceMissingOption', { option: label }) : AI_REVIEW.priceMissing,
      });
    }
    if (o.cost.kind === 'invalid') {
      fix.push({
        level: 'fix',
        kind: 'cost_invalid',
        text: many ? reviewText('costInvalidOption', { option: label }) : AI_REVIEW.costInvalid,
      });
    }

    const code = o.barcode.trim();
    if (code) {
      const problem = barcodeProblem(code, detectSymbology(code));
      if (problem) {
        fix.push({
          level: 'fix',
          kind: 'barcode_invalid',
          text: many ? reviewText('barcodeInvalidOption', { option: label, problem: lowerFirst(problem) }) : problem,
        });
      } else if (seenCodes.has(code) && !repeatedCodes.has(code)) {
        repeatedCodes.add(code);
        fix.push({ level: 'fix', kind: 'barcode_repeated', text: reviewText('barcodeRepeated', { barcode: code }) });
      }
      seenCodes.add(code);
    }

    if (sold && o.price.kind === 'ok' && o.cost.kind === 'ok' && o.price.pence > 0 && o.cost.pence > o.price.pence) {
      check.push({
        level: 'check',
        kind: 'cost_above_price',
        text: many ? reviewText('costAbovePriceOption', { option: label }) : AI_REVIEW.costAbovePrice,
      });
    }
  });

  if (input.priceMaybeTrade && sold && input.options.some((o) => o.price.kind === 'ok')) {
    check.unshift({ level: 'check', kind: 'price_maybe_trade', text: AI_REVIEW.priceMaybeTrade });
  }
  if (input.usageGuessed && input.usage === 'backbar') {
    check.push({ level: 'check', kind: 'usage_guess', text: AI_REVIEW.usageGuess });
  }
  if (input.duplicate) check.push({ level: 'check', kind: 'duplicate', text: AI_REVIEW.duplicate });

  const info: ReviewNote[] = [];
  for (const note of input.notes) {
    const text = note.trim();
    if (text && !info.some((n) => n.text === text)) info.push({ level: 'info', kind: 'note', text });
  }
  return [...fix, ...check, ...info];
}

/** A product's level: its worst note. */
export function reviewLevel(notes: readonly ReviewNote[]): ProductAiDraftLevel {
  if (notes.some((n) => n.level === 'fix')) return 'fix';
  if (notes.some((n) => n.level === 'check')) return 'check';
  return 'ready';
}

/** "Repair Shampoo!" and "repair  shampoo" are the same name; "Hair & Body" is "hair and body". */
export function normaliseProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Two products are the same when their names match and their brands do not disagree, or when one
 * names the brand inside the name. Two products with different brands are never the same.
 */
export function isSameProduct(a: { name: string; brand: string | null }, b: { name: string; brand: string | null }): boolean {
  const nameA = normaliseProductName(a.name);
  const nameB = normaliseProductName(b.name);
  if (!nameA || !nameB) return false;
  const brandA = normaliseProductName(a.brand ?? '');
  const brandB = normaliseProductName(b.brand ?? '');
  if (brandA && brandB && brandA !== brandB) return false;
  if (nameA === nameB) return true;
  if (brandA && !brandB && `${brandA} ${nameA}` === nameB) return true;
  if (brandB && !brandA && `${brandB} ${nameB}` === nameA) return true;
  return false;
}

// ─── The drafts under review ────────────────────────────────────────────────

export type DraftStatus = 'pending' | 'added' | 'skipped';

export interface DraftOptionState {
  key: string;
  /** Size or shade, '' for none. */
  name: string;
  /** As typed ("18.50"); '' for none. */
  price: string;
  cost: string;
  barcode: string;
}

export interface ProductDraftState {
  key: string;
  status: DraftStatus;
  name: string;
  brand: string;
  category: string;
  usage: ProductAiUsage;
  options: DraftOptionState[];
  /** The reader thought the price might be a trade price; cleared once the owner sets the price. */
  priceMaybeTrade: boolean;
  /** The reader guessed "for treatments only"; cleared once the owner chooses. */
  usageGuessed: boolean;
  /** The venue's product this one repeats (its id, from the server's duplicate check). */
  duplicateOf: string | null;
  /** The reader's own notes (`info`). */
  aiNotes: string[];
  /** Where the owner gave us this product ("Photo 1", a file's name, a site, "Your typed list"). */
  sources: string[];
  /** The last add failure, shown on the card until the next try. */
  error: string | null;
  /** The product made from it. */
  createdProductId: string | null;
}

const USAGES: readonly ProductAiUsage[] = ['retail', 'backbar', 'both'];

export function reviewInputOfState(d: ProductDraftState): ReviewInput {
  return {
    name: d.name,
    usage: d.usage,
    options: d.options.map((o) => ({ name: o.name, price: moneyValueOfInput(o.price), cost: moneyValueOfInput(o.cost), barcode: o.barcode })),
    priceMaybeTrade: d.priceMaybeTrade,
    usageGuessed: d.usageGuessed,
    duplicate: d.duplicateOf !== null && d.status === 'pending',
    notes: d.aiNotes,
  };
}

export function draftNotes(d: ProductDraftState): ReviewNote[] {
  return reviewProduct(reviewInputOfState(d));
}

export function draftCanBeAdded(notes: readonly ReviewNote[]): boolean {
  return !notes.some((n) => n.level === 'fix');
}

/** "Add all ready" takes drafts that need no decision at all. */
export function draftReadyForBulkAdd(d: ProductDraftState, notes: readonly ReviewNote[]): boolean {
  return d.status === 'pending' && reviewLevel(notes) === 'ready';
}

let optionSeq = 0;
export function newOptionKey(draftKey: string): string {
  optionSeq += 1;
  return `${draftKey}-n${optionSeq}`;
}

export function blankOption(draftKey: string): DraftOptionState {
  return { key: newOptionKey(draftKey), name: '', price: '', cost: '', barcode: '' };
}

/**
 * One draft from the reader's answer. The answer's notes are the review's own plus the reader's;
 * the review recomputed for the draft as it arrived gives back exactly the first kind (its flag
 * sentences carry no placeholders), so what is left is the reader's.
 */
export function draftStateFromServer(d: ProductAiDraft, sourceLabel: string, key: string): ProductDraftState {
  const raw = Array.isArray(d.options) && d.options.length > 0 ? d.options : [{ name: null, price_pence: null, cost_pence: null, barcode: null }];
  const usage = (USAGES as readonly string[]).includes(d.usage) ? d.usage : 'retail';
  const notes = Array.isArray(d.notes) ? d.notes.filter((n): n is string => typeof n === 'string') : [];
  const state: ProductDraftState = {
    key,
    status: 'pending',
    name: d.name ?? '',
    brand: d.brand ?? '',
    category: d.category ?? '',
    usage,
    options: raw.map((o, i) => ({
      key: `${key}-o${i}`,
      name: o.name ?? '',
      price: penceToInput(o.price_pence),
      cost: penceToInput(o.cost_pence),
      barcode: o.barcode ?? '',
    })),
    priceMaybeTrade: notes.includes(AI_REVIEW.priceMaybeTrade),
    usageGuessed: usage === 'backbar' && notes.includes(AI_REVIEW.usageGuess),
    duplicateOf: d.duplicate_of ?? null,
    aiNotes: [],
    sources: [sourceLabel],
    error: null,
    createdProductId: null,
  };
  const computed = new Set(reviewProduct({ ...reviewInputOfState(state), notes: [] }).map((n) => n.text));
  state.aiNotes = notes.filter((n) => !computed.has(n)).slice(0, MAX_NOTES);
  return state;
}

function isBlank(o: DraftOptionState): boolean {
  return !o.name.trim() && !o.price.trim() && !o.cost.trim() && !o.barcode.trim();
}

/**
 * Adds one source's answer to the list. A product already there (same name, brands not disagreeing)
 * is filled in where it was blank, never overwritten, and only while it is still waiting for review;
 * its new sizes or shades are added.
 */
export function mergeServerDrafts(
  existing: ProductDraftState[],
  incoming: ProductAiDraft[],
  sourceLabel: string,
  makeKey: () => string,
): { drafts: ProductDraftState[]; added: number; alreadyListed: number } {
  const drafts = existing.map((d) => ({ ...d, options: d.options.map((o) => ({ ...o })), sources: [...d.sources], aiNotes: [...d.aiNotes] }));
  let added = 0;
  let alreadyListed = 0;
  for (const p of incoming) {
    const at = (p.name ?? '').trim()
      ? drafts.findIndex((d) => isSameProduct({ name: d.name, brand: d.brand || null }, { name: p.name, brand: p.brand }))
      : -1;
    if (at < 0) {
      drafts.push(draftStateFromServer(p, sourceLabel, makeKey()));
      added++;
      continue;
    }
    alreadyListed++;
    const d = drafts[at]!;
    if (!d.sources.includes(sourceLabel)) d.sources.push(sourceLabel);
    if (d.status !== 'pending') continue;
    const inc = draftStateFromServer(p, sourceLabel, d.key);
    if (!d.brand.trim() && inc.brand) d.brand = inc.brand;
    if (!d.category.trim() && inc.category) d.category = inc.category;
    d.duplicateOf = d.duplicateOf ?? inc.duplicateOf;
    if (d.options.length === 1 && isBlank(d.options[0]!)) d.options = [];
    let filledPrice = false;
    for (const o of inc.options) {
      if (isBlank(o)) continue;
      const same = d.options.find((x) => normaliseProductName(x.name) === normaliseProductName(o.name));
      if (same) {
        if (!same.price.trim() && o.price) {
          same.price = o.price;
          filledPrice = true;
        }
        if (!same.cost.trim()) same.cost = o.cost;
        if (!same.barcode.trim()) same.barcode = o.barcode;
      } else if (d.options.length < DRAFT_MAX_OPTIONS) {
        d.options.push({ ...o, key: newOptionKey(d.key) });
        if (o.price) filledPrice = true;
      }
    }
    if (d.options.length === 0) d.options.push(blankOption(d.key));
    if (filledPrice && inc.priceMaybeTrade) d.priceMaybeTrade = true;
    for (const n of inc.aiNotes) if (!d.aiNotes.includes(n) && d.aiNotes.length < MAX_NOTES) d.aiNotes.push(n);
  }
  return { drafts, added, alreadyListed };
}

/**
 * The body for `POST /api/venue/retail/products`, as the web sends it: backbar is the API's
 * `professional` (never sold, so a blank price saves as zero), each size or shade an option with its
 * own price, cost and barcode, and never a stock count. Track stock and "sold online" follow the
 * venue and the products route.
 */
export function buildProductBody(
  d: ProductDraftState,
  ids: { brandId: string | null; categoryId: string | null; clientRequestId: string },
): Record<string, unknown> {
  return {
    client_request_id: ids.clientRequestId,
    name: d.name.trim(),
    brand_id: ids.brandId,
    category_id: ids.categoryId,
    usage: d.usage === 'backbar' ? 'professional' : d.usage,
    variants: d.options.map((o, i) => {
      const price = moneyValueOfInput(o.price);
      const cost = moneyValueOfInput(o.cost);
      const code = o.barcode.trim();
      return {
        option_name: o.name.trim() || null,
        price_pence: price.kind === 'ok' ? price.pence : 0,
        ...(cost.kind === 'ok' ? { cost_pence: cost.pence } : {}),
        ...(code ? { barcodes: [{ barcode: code }] } : {}),
        sort_order: i,
      };
    }),
  };
}

/** The lowest price among the options, or null. */
export function lowestPricePence(d: ProductDraftState): number | null {
  let low: number | null = null;
  for (const o of d.options) {
    const v = moneyValueOfInput(o.price);
    if (v.kind === 'ok' && (low === null || v.pence < low)) low = v.pence;
  }
  return low;
}

/** "250 ml · £18.50 · Shampoo", or "2 options, from £18.50 · Shampoo" (the web card, mock-up B9). */
export function draftSummary(d: ProductDraftState, money: (pence: number) => string): string {
  const parts: string[] = [];
  if (d.options.length > 1) {
    const low = lowestPricePence(d);
    const options = aiCount('ai.card.options', d.options.length);
    parts.push(low === null ? options : `${options}, ${aiT('ai.card.from', { price: money(low) })}`);
  } else {
    const only = d.options[0];
    if (only?.name.trim()) parts.push(only.name.trim());
    const price = moneyValueOfInput(only?.price ?? '');
    parts.push(price.kind === 'ok' ? money(price.pence) : price.kind === 'invalid' ? aiT('ai.card.priceFix') : aiT('ai.card.noPrice'));
  }
  if (d.category.trim()) parts.push(d.category.trim());
  if (d.usage === 'backbar') parts.push(aiT('ai.card.backbar'));
  return parts.join(' · ');
}

// ─── Sources and their requests ─────────────────────────────────────────────

export interface AiSource {
  key: string;
  kind: ProductAiExtractRequest['kind'];
  /** What the owner sees: "Photo 1", a file's name, a web address, "Your typed list". */
  label: string;
  /** Photos: one photo, or the slices of one long screenshot, as data URLs. */
  images?: string[];
  /** A photo's own file, for its thumbnail. */
  thumbUri?: string | null;
  file?: { name: string; data_url: string };
  url?: string;
  text?: string;
  status: 'waiting' | 'reading' | 'done' | 'failed';
  /** Products this source added to the list, and ones it found that were already there. */
  found?: number;
  alreadyListed?: number;
  error?: string;
}

/** The request body for one source (one source per call). */
export function requestFor(source: AiSource): ProductAiExtractRequest {
  switch (source.kind) {
    case 'images':
      return { kind: 'images', images: source.images ?? [] };
    case 'file':
      return { kind: 'file', file: source.file };
    case 'link':
      return { kind: 'link', url: source.url };
    case 'text':
      return { kind: 'text', text: source.text };
  }
}

/** "shop.example.com/collections/hair" for a pasted link (the web's label). */
export function linkLabel(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}

/** A typed web address, with `https://` when it has none; null when it is not one. */
export function normaliseLink(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value) || value.length > 2048) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** "Found 3 products, plus 1 already on your list" for a source read (the web's line). */
export function foundLine(s: Pick<AiSource, 'found' | 'alreadyListed'>): string {
  const found = s.found ?? 0;
  const listed = s.alreadyListed ?? 0;
  if (found === 0 && listed > 0) return aiCount('ai.read.foundOnly', listed);
  if (listed > 0) return aiCount('ai.read.foundPlus', found, { listed });
  return aiCount('ai.read.found', found);
}

// ─── The reader's answer, read defensively ──────────────────────────────────

function optionalText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function wholePence(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/** The reader's answer (`{ drafts, notes }`), or null when it is not one. */
export function normaliseAiResponse(raw: unknown): ProductAiExtractResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as { drafts?: unknown; notes?: unknown };
  if (!Array.isArray(body.drafts)) return null;
  const drafts: ProductAiDraft[] = [];
  body.drafts.forEach((d, i) => {
    if (!d || typeof d !== 'object') return;
    const r = d as Record<string, unknown>;
    const options = (Array.isArray(r.options) ? r.options : [])
      .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
      .map((o) => ({
        name: optionalText(o.name),
        price_pence: wholePence(o.price_pence),
        cost_pence: typeof o.cost_pence === 'number' && Number.isFinite(o.cost_pence) && o.cost_pence >= 0 ? o.cost_pence : null,
        barcode: optionalText(o.barcode),
      }));
    drafts.push({
      key: typeof r.key === 'string' && r.key ? r.key : `p${i + 1}`,
      name: typeof r.name === 'string' ? r.name : '',
      brand: optionalText(r.brand),
      category: optionalText(r.category),
      options,
      usage: r.usage === 'backbar' || r.usage === 'both' ? r.usage : 'retail',
      level: r.level === 'ready' || r.level === 'fix' ? r.level : 'check',
      notes: (Array.isArray(r.notes) ? r.notes : []).filter((n): n is string => typeof n === 'string'),
      duplicate_of: optionalText(r.duplicate_of),
    });
  });
  const notes = (Array.isArray(body.notes) ? body.notes : []).filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  return { drafts, notes };
}
