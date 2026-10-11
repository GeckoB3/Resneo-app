/**
 * The words of "Add products with AI" follow the house rules (CLAUDE.md): no em-dash anywhere,
 * straight apostrophes, no currency symbol before a money placeholder, no country or competitor
 * named, every placeholder filled by its caller, the singular for one, mock-up B9's lines word for
 * word, and the review notes word for word the server's (the app tells them apart by their text).
 */
import { AI_COPY, AI_REVIEW, aiCount, aiT, reviewText, type AiCopyId } from './copy';

describe('the products AI copy deck', () => {
  const entries = [...Object.entries(AI_COPY), ...Object.entries(AI_REVIEW)];

  it('never uses an em-dash', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    expect(entries.filter(([, text]) => text.includes(EM_DASH)).map(([id]) => id)).toEqual([]);
  });

  it('uses straight apostrophes and quotes', () => {
    const curly = [0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c));
    expect(entries.filter(([, text]) => curly.some((c) => text.includes(c))).map(([id]) => id)).toEqual([]);
  });

  it('never writes a currency symbol next to a money placeholder', () => {
    expect(entries.filter(([, text]) => /[£€]\{/.test(text)).map(([id]) => id)).toEqual([]);
  });

  it("never names a country or a competitor in the app's own lines", () => {
    const banned = /northern ireland|great britain|\bGB\b|england|scotland|wales|\.co\.uk|fresha|phorest|booksy|square|vagaro|shopify|treatwell/i;
    expect(entries.filter(([, text]) => banned.test(text)).map(([id]) => id)).toEqual([]);
  });

  it('leaves no placeholder unfilled where the screens use one', () => {
    const vars: Record<string, string | number> = {
      count: 2,
      names: 'Photo 1',
      size: 3,
      label: 'Photo 1',
      error: 'Too big.',
      n: 2,
      listed: 1,
      added: 1,
      skipped: 1,
      pending: 1,
      done: 1,
      total: 3,
      price: '£18.50',
      option: '250 ml',
      field: 'Price',
      name: 'Bloom',
      problem: 'wrong',
      barcode: '5901234123457',
    };
    const unfilled = (Object.keys(AI_COPY) as AiCopyId[]).filter((id) => /\{\w+\}/.test(aiT(id, vars)));
    expect(unfilled).toEqual([]);
    const review = (Object.keys(AI_REVIEW) as (keyof typeof AI_REVIEW)[]).filter((id) => /\{\w+\}/.test(reviewText(id, vars)));
    expect(review).toEqual([]);
  });

  it('keeps mock-up B9 word for word', () => {
    expect(AI_COPY['ai.title']).toBe('Add products with AI');
    expect(AI_COPY['ai.card.ready']).toBe('Ready');
    expect(AI_COPY['ai.card.check']).toBe('Check');
    expect(AI_COPY['ai.card.edit']).toBe('Edit');
    expect(AI_COPY['ai.card.skip']).toBe('Skip');
    expect(aiT('ai.addAll', { count: 6 })).toBe('Add all ready (6)');
    expect(AI_COPY['ai.desc.review']).toBe('Check each product, then add it. Nothing is added until you say so.');
  });

  it("keeps the server's review sentences word for word (the flags are read by them)", () => {
    expect(AI_REVIEW.priceMaybeTrade).toBe("This price may be what you pay your supplier. Check it's the price you sell it for.");
    expect(AI_REVIEW.usageGuess).toBe(
      'This looks like something you use in treatments, so we set it to For treatments only. Change it if you sell it.',
    );
    expect(AI_REVIEW.duplicate).toBe('This looks like a product you already have. Adding it makes a second one.');
    expect(AI_REVIEW.priceMissing).toBe("Add the price you sell it for. Without a price it can't go on the till.");
  });

  it('uses the singular for one', () => {
    expect(aiCount('ai.toast.added', 1)).toBe('1 product added.');
    expect(aiCount('ai.toast.added', 3)).toBe('3 products added.');
    expect(aiCount('ai.addAll.title', 1)).toBe('Add 1 product?');
    expect(aiCount('ai.leave.body', 2)).toContain('2 products are still waiting');
    expect(aiCount('ai.src.tooBig', 1, { names: 'list.pdf', size: 3 })).toBe(
      "list.pdf is over 3 MB, so we can't send it. Try a photo or a screenshot instead.",
    );
  });
});
