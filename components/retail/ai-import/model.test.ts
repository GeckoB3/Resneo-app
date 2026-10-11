/**
 * "Add products with AI" as plain functions, rule for rule the web's (`review.ts`,
 * `draft-state.ts`, `sources.ts`, `price-input.ts`): the review notes and levels, telling the
 * server's own notes from the reader's, merging what several sources found, the products route body,
 * and each source's request.
 */
import type { ProductAiDraft } from '@/types/pos-setup';

import { AI_REVIEW } from './copy';
import {
  buildProductBody,
  draftNotes,
  draftReadyForBulkAdd,
  draftStateFromServer,
  draftSummary,
  foundLine,
  isSameProduct,
  linkLabel,
  mergeServerDrafts,
  moneyValueOfInput,
  normaliseAiResponse,
  normaliseLink,
  parsePriceInput,
  penceToInput,
  requestFor,
  reviewLevel,
  reviewProduct,
  type MoneyValue,
} from './model';

/** Money as the screens write it. */
const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;

let seq = 0;
const makeKey = () => `k${++seq}`;

/** A draft as the server sends it: its notes are the review's own, then the reader's. */
function serverDraft(name: string, extra: Partial<ProductAiDraft> = {}): ProductAiDraft {
  return {
    key: 'p1',
    name,
    brand: null,
    category: null,
    options: [{ name: null, price_pence: 1850, cost_pence: null, barcode: null }],
    usage: 'retail',
    level: 'ready',
    notes: [],
    duplicate_of: null,
    ...extra,
  };
}

const ok = (pence: number): MoneyValue => ({ kind: 'ok', pence });
const empty: MoneyValue = { kind: 'empty' };

describe('reviewProduct (the server rules)', () => {
  const base = { name: 'Repair Shampoo', usage: 'retail' as const, priceMaybeTrade: false, usageGuessed: false, duplicate: false, notes: [] };

  it('needs a fix for no name, and for no price on a product sold at the till', () => {
    expect(reviewProduct({ ...base, options: [{ name: '', price: ok(1850), cost: empty, barcode: '' }] })).toEqual([]);
    const notes = reviewProduct({ ...base, name: '', options: [{ name: '', price: empty, cost: empty, barcode: '' }] });
    expect(notes.map((n) => n.text)).toEqual([AI_REVIEW.nameMissing, AI_REVIEW.priceMissing]);
    expect(reviewLevel(notes)).toBe('fix');
    // A product for treatments only is never sold: no price is fine.
    expect(reviewProduct({ ...base, usage: 'backbar', options: [{ name: '', price: empty, cost: empty, barcode: '' }] })).toEqual([]);
  });

  it('names the option with the problem, and needs each option named once', () => {
    const notes = reviewProduct({
      ...base,
      options: [
        { name: '250 ml', price: { kind: 'invalid' }, cost: empty, barcode: '5901234123458' },
        { name: '', price: ok(4200), cost: ok(5000), barcode: '' },
        { name: '250 ml', price: ok(100), cost: { kind: 'invalid' }, barcode: '' },
      ],
    });
    expect(notes.map((n) => n.text)).toEqual([
      "250 ml: the price isn't a number. Use something like 18 or 18.50.",
      "250 ml: that barcode's check digit is wrong. Check it and try again.",
      'Option 2 needs a name, like a size or shade.',
      'Two options are called 250 ml. Give each its own name.',
      "250 ml: the cost isn't a number. Use something like 9 or 9.25, or leave it blank.",
      'Option 2: the cost is more than the price. Check both.',
    ]);
    expect(reviewLevel(notes)).toBe('fix');
  });

  it('asks for a check on a possible trade price, a guessed backbar use and a product already there', () => {
    const notes = reviewProduct({
      ...base,
      usage: 'backbar',
      usageGuessed: true,
      priceMaybeTrade: true,
      duplicate: true,
      notes: ['Read from the top shelf.', 'Read from the top shelf.'],
      options: [{ name: '1 litre', price: ok(4200), cost: empty, barcode: '' }],
    });
    // A possible trade price only matters for something sold.
    expect(notes.map((n) => [n.level, n.text])).toEqual([
      ['check', AI_REVIEW.usageGuess],
      ['check', AI_REVIEW.duplicate],
      ['info', 'Read from the top shelf.'],
    ]);
    expect(reviewLevel(notes)).toBe('check');
  });
});

describe('the drafts under review', () => {
  it('turns pence into boxes and tells the review notes apart from the reader notes', () => {
    const d = draftStateFromServer(
      serverDraft('Colour Protect Mask', {
        brand: 'Glow',
        level: 'check',
        notes: [AI_REVIEW.priceMaybeTrade, 'Your invoice listed a pack.'],
      }),
      'invoice.pdf',
      'k-mask',
    );
    expect(d).toMatchObject({
      key: 'k-mask',
      status: 'pending',
      name: 'Colour Protect Mask',
      brand: 'Glow',
      priceMaybeTrade: true,
      usageGuessed: false,
      aiNotes: ['Your invoice listed a pack.'],
      sources: ['invoice.pdf'],
    });
    expect(d.options[0]).toMatchObject({ name: '', price: '18.50', cost: '', barcode: '' });
    // Recomputed, the notes are exactly what the server said.
    expect(draftNotes(d).map((n) => n.text)).toEqual([AI_REVIEW.priceMaybeTrade, 'Your invoice listed a pack.']);
  });

  it('drops a note the moment its cause is fixed', () => {
    const d = draftStateFromServer(
      serverDraft('Spray', { level: 'fix', notes: [AI_REVIEW.priceMissing], options: [{ name: null, price_pence: null, cost_pence: null, barcode: null }] }),
      'list',
      'k1',
    );
    expect(d.aiNotes).toEqual([]);
    expect(reviewLevel(draftNotes(d))).toBe('fix');
    const fixed = { ...d, options: [{ ...d.options[0]!, price: '16' }] };
    expect(draftNotes(fixed)).toEqual([]);
    expect(draftReadyForBulkAdd(fixed, draftNotes(fixed))).toBe(true);
    expect(draftReadyForBulkAdd({ ...fixed, status: 'added' }, draftNotes(fixed))).toBe(false);
  });

  it('keeps the backbar guess until the owner chooses, and the duplicate check while it waits', () => {
    const d = draftStateFromServer(serverDraft('Developer 6%', { usage: 'backbar', level: 'check', notes: [AI_REVIEW.usageGuess] }), 'photo', 'k2');
    expect(d.usageGuessed).toBe(true);
    expect(draftNotes(d).map((n) => n.kind)).toEqual(['usage_guess']);
    expect(draftNotes({ ...d, usageGuessed: false })).toEqual([]);
    // `duplicate_of` is the venue's product's id.
    const dup = draftStateFromServer(serverDraft('Mask', { duplicate_of: '5555-id', level: 'check', notes: [AI_REVIEW.duplicate] }), 'a', 'k3');
    expect(dup.duplicateOf).toBe('5555-id');
    expect(draftNotes(dup).map((n) => n.kind)).toEqual(['duplicate']);
    expect(draftNotes({ ...dup, status: 'skipped' })).toEqual([]);
  });

  it('describes a card as mock-up B9 does', () => {
    const two = draftStateFromServer(
      serverDraft('Repair Shampoo', {
        category: 'Hair care',
        options: [
          { name: '250 ml', price_pence: 1850, cost_pence: null, barcode: null },
          { name: '1 litre', price_pence: 4200, cost_pence: null, barcode: null },
        ],
      }),
      'a',
      'k4',
    );
    expect(draftSummary(two, money)).toBe('2 options, from £18.50 · Hair care');
    const one = draftStateFromServer(serverDraft('Spray', { options: [{ name: '150 ml', price_pence: 1600, cost_pence: null, barcode: null }] }), 'a', 'k5');
    expect(draftSummary(one, money)).toBe('150 ml · £16.00');
    expect(draftSummary({ ...one, options: [{ ...one.options[0]!, price: 'abc' }], usage: 'backbar' }, money)).toBe(
      '150 ml · Price needs fixing · For treatments only',
    );
  });
});

describe('mergeServerDrafts', () => {
  it('adds new products and fills in ones already listed, never overwriting', () => {
    const first = mergeServerDrafts(
      [],
      [serverDraft('Repair Shampoo', { brand: 'Glow', options: [{ name: '250 ml', price_pence: 1850, cost_pence: null, barcode: null }] })],
      'Photo 1',
      makeKey,
    );
    expect(first).toMatchObject({ added: 1, alreadyListed: 0 });
    const second = mergeServerDrafts(
      first.drafts,
      [
        serverDraft('repair shampoo', {
          category: 'Shampoo',
          options: [
            { name: '250 ml', price_pence: 9999, cost_pence: 925, barcode: '5012345678900' },
            { name: '1 litre', price_pence: 4200, cost_pence: null, barcode: null },
          ],
        }),
        serverDraft('Sea Salt Spray'),
      ],
      'invoice.pdf',
      makeKey,
    );
    expect(second).toMatchObject({ added: 1, alreadyListed: 1 });
    const shampoo = second.drafts[0]!;
    expect(shampoo).toMatchObject({ brand: 'Glow', category: 'Shampoo', sources: ['Photo 1', 'invoice.pdf'] });
    expect(shampoo.options.map((o) => [o.name, o.price, o.cost, o.barcode])).toEqual([
      ['250 ml', '18.50', '9.25', '5012345678900'],
      ['1 litre', '42.00', '', ''],
    ]);
    expect(first.drafts[0]!.options).toHaveLength(1);
  });

  it('leaves an added product alone, and never joins two brands', () => {
    const one = mergeServerDrafts([], [serverDraft('Mask')], 'a', makeKey).drafts.map((d) => ({ ...d, status: 'added' as const }));
    const two = mergeServerDrafts(one, [serverDraft('Mask', { category: 'Treatments' })], 'b', makeKey);
    expect(two.alreadyListed).toBe(1);
    expect(two.drafts[0]!.category).toBe('');
    expect(isSameProduct({ name: 'Mask', brand: 'Glow' }, { name: 'mask', brand: 'Other' })).toBe(false);
    expect(isSameProduct({ name: 'No.4 Shampoo', brand: 'Olaplex' }, { name: 'Olaplex No.4 Shampoo', brand: null })).toBe(true);
  });
});

describe('buildProductBody', () => {
  const ids = { brandId: 'brand-1', categoryId: null, clientRequestId: 'ai-session-k1' };

  it('builds the body the products route takes, never with a stock count', () => {
    const d = draftStateFromServer(
      serverDraft('Repair Shampoo', {
        options: [
          { name: '250 ml', price_pence: 1850, cost_pence: 925, barcode: '5012345678900' },
          { name: '1 litre', price_pence: 4200, cost_pence: null, barcode: null },
        ],
      }),
      'list',
      'k1',
    );
    expect(buildProductBody(d, ids)).toEqual({
      client_request_id: 'ai-session-k1',
      name: 'Repair Shampoo',
      brand_id: 'brand-1',
      category_id: null,
      usage: 'retail',
      variants: [
        { option_name: '250 ml', price_pence: 1850, cost_pence: 925, barcodes: [{ barcode: '5012345678900' }], sort_order: 0 },
        { option_name: '1 litre', price_pence: 4200, sort_order: 1 },
      ],
    });
    expect(JSON.stringify(buildProductBody(d, ids))).not.toMatch(/opening_quantity|track_stock|reorder/);
  });

  it('sends a product for treatments only as professional, at zero when it has no price', () => {
    const d = draftStateFromServer(
      serverDraft('Developer 6%', { usage: 'backbar', options: [{ name: '1 litre', price_pence: null, cost_pence: 450, barcode: null }] }),
      'photo',
      'k2',
    );
    expect(buildProductBody(d, { ...ids, brandId: null })).toMatchObject({
      usage: 'professional',
      variants: [{ option_name: '1 litre', price_pence: 0, cost_pence: 450, sort_order: 0 }],
    });
  });
});

describe('amount boxes', () => {
  it('reads what people type, as the web does, within the products API limit', () => {
    expect(moneyValueOfInput('')).toEqual({ kind: 'empty' });
    expect(moneyValueOfInput('£18.5')).toEqual({ kind: 'ok', pence: 1850 });
    expect(moneyValueOfInput('25,50')).toEqual({ kind: 'ok', pence: 2550 });
    expect(moneyValueOfInput('1,250')).toEqual({ kind: 'ok', pence: 125000 });
    expect(moneyValueOfInput('abc')).toEqual({ kind: 'invalid' });
    expect(moneyValueOfInput('-5')).toEqual({ kind: 'invalid' });
    expect(moneyValueOfInput('18.505')).toEqual({ kind: 'invalid' });
    expect(moneyValueOfInput('20000.01')).toEqual({ kind: 'invalid' });
    expect(parsePriceInput('0')).toEqual({ kind: 'ok', pence: 0 });
    expect(penceToInput(1850)).toBe('18.50');
    expect(penceToInput(null)).toBe('');
  });
});

describe('sources', () => {
  it('sends one source per request', () => {
    expect(requestFor({ key: 's', kind: 'images', label: 'Photo 1', images: ['a', 'b'], status: 'waiting' })).toEqual({
      kind: 'images',
      images: ['a', 'b'],
    });
    expect(requestFor({ key: 's', kind: 'file', label: 'list.csv', file: { name: 'list.csv', data_url: 'data:text/csv;base64,AA' }, status: 'waiting' })).toEqual({
      kind: 'file',
      file: { name: 'list.csv', data_url: 'data:text/csv;base64,AA' },
    });
    expect(requestFor({ key: 's', kind: 'link', label: 'x', url: 'https://x.example/', status: 'waiting' })).toEqual({ kind: 'link', url: 'https://x.example/' });
    expect(requestFor({ key: 's', kind: 'text', label: 'x', text: 'Wax 12', status: 'waiting' })).toEqual({ kind: 'text', text: 'Wax 12' });
  });

  it('checks a typed link and labels it as the web does', () => {
    expect(normaliseLink('www.bloomhair.example/shop')).toBe('https://www.bloomhair.example/shop');
    expect(normaliseLink('bloom hair')).toBeNull();
    expect(normaliseLink('localhost')).toBeNull();
    expect(normaliseLink('ftp://bloomhair.example')).toBeNull();
    expect(linkLabel('https://www.bloomhair.example/collections/hair')).toBe('bloomhair.example/collections/hair');
    expect(linkLabel('https://shop.example.com/')).toBe('shop.example.com');
  });

  it("says what a source's read found", () => {
    expect(foundLine({ found: 3, alreadyListed: 0 })).toBe('Found 3 products');
    expect(foundLine({ found: 1, alreadyListed: 2 })).toBe('Found 1 product, plus 2 already on your list');
    expect(foundLine({ found: 0, alreadyListed: 1 })).toBe("Found 1 product you'd already added from somewhere else");
  });
});

describe('normaliseAiResponse', () => {
  it('reads the answer defensively', () => {
    expect(normaliseAiResponse(null)).toBeNull();
    expect(normaliseAiResponse({ ok: true })).toBeNull();
    const out = normaliseAiResponse({
      drafts: [
        { key: 'p1', name: 'Spray', brand: '', options: [{ name: '150 ml', price_pence: -5, cost_pence: 12.5, barcode: 7 }], usage: 'odd', level: 'great', notes: ['x', 3] },
        null,
      ],
      notes: ['Some prices looked like trade prices.', ''],
    });
    expect(out!.notes).toEqual(['Some prices looked like trade prices.']);
    expect(out!.drafts).toEqual([
      {
        key: 'p1',
        name: 'Spray',
        brand: null,
        category: null,
        options: [{ name: '150 ml', price_pence: null, cost_pence: 12.5, barcode: null }],
        usage: 'retail',
        level: 'check',
        notes: ['x'],
        duplicate_of: null,
      },
    ]);
  });
});
