/**
 * The setup's draft model (web parity: `src/lib/services-setup/drafts.test.ts`, ported to Jest;
 * the web's `appointmentServiceFormToPayload` step is the app's `formToCreateBody`).
 */
import {
  cleanPriceInput,
  currencySymbolFor,
  draftCanBeAdded,
  draftFromExtracted,
  draftIssues,
  draftReadyForBulkAdd,
  draftSummary,
  existingSummary,
  draftToForm,
  formToCreateBody,
  formatMinutes,
  mergeIntoDrafts,
  normaliseServiceName,
  normaliseStoredDraft,
  paymentDefaultValid,
  updatableDuplicate,
  type ExistingServiceRef,
  type ServiceDraft,
} from './drafts';
import type { ExtractedService } from './types';

function extracted(overrides: Partial<ExtractedService> = {}): ExtractedService {
  return {
    name: 'Cut & Blow Dry',
    category: 'Cuts',
    description: null,
    duration_minutes: 45,
    suggested_duration_minutes: 45,
    price_pence: 3500,
    price_kind: 'fixed',
    options: [],
    notes: [],
    looks_like_addon: false,
    ...overrides,
  };
}

const ctx = { existingServiceNames: new Set<string>(), currencySymbol: '£' };
let n = 0;
const makeKey = () => `k${n++}`;

function kinds(d: ServiceDraft, c = ctx) {
  return draftIssues(d, c).map((i) => `${i.level}:${i.kind}`);
}

describe('normaliseServiceName', () => {
  it('treats punctuation, case and & as the same', () => {
    expect(normaliseServiceName("Cut & Blow-Dry!")).toBe(normaliseServiceName('cut and blow dry'));
    expect(normaliseServiceName("Men's Cut")).toBe('mens cut');
  });
});

describe('cleanPriceInput', () => {
  it.each([
    ['£35', '35'],
    [' 32.50 ', '32.50'],
    ['35,50', '35.50'],
    ['1,200', '1200'],
    ['', ''],
    ['GBP 20', '20'],
  ])('reads %s as %s', (input, expected) => {
    expect(cleanPriceInput(input)).toBe(expected);
  });

  it.each(['abc', '12.345', '-5', '£'])('refuses %s', (input) => {
    expect(cleanPriceInput(input)).toBe(input === '£' ? '' : null);
  });
});

describe('draftFromExtracted', () => {
  it('uses the stated length and marks a guessed one as estimated', () => {
    const stated = draftFromExtracted(extracted(), 'menu.pdf', 'a');
    expect(stated).toMatchObject({ duration: '45', durationEstimated: false, price: '35', category: 'Cuts', sources: ['menu.pdf'] });
    const guessed = draftFromExtracted(extracted({ duration_minutes: null, suggested_duration_minutes: 60, price_pence: 3250 }), 'x', 'b');
    expect(guessed).toMatchObject({ duration: '60', durationEstimated: true, price: '32.50' });
  });
});

describe('mergeIntoDrafts', () => {
  it('adds new services and fills gaps in pending ones from a second source', () => {
    const first = mergeIntoDrafts([], [extracted({ price_pence: null, price_kind: 'not_stated', duration_minutes: null })], 'photo', makeKey);
    expect(first).toMatchObject({ added: 1, alreadyListed: 0 });
    const second = mergeIntoDrafts(first.drafts, [extracted({ name: 'cut and blow dry' }), extracted({ name: 'Fringe Trim' })], 'site', makeKey);
    expect(second).toMatchObject({ added: 1, alreadyListed: 1 });
    expect(second.drafts[0]).toMatchObject({ price: '35', duration: '45', durationEstimated: false, sources: ['photo', 'site'] });
  });

  it('keeps the same name under two headings as two services', () => {
    const out = mergeIntoDrafts(
      [],
      [
        extracted({ name: 'Full head', category: 'Tint', price_pence: 6000 }),
        extracted({ name: 'Full head', category: 'Highlights', price_pence: 9000 }),
      ],
      'menu',
      makeKey,
    );
    expect(out).toMatchObject({ added: 2, alreadyListed: 0 });
    // A later source without headings fills the first match rather than adding a third.
    const again = mergeIntoDrafts(out.drafts, [extracted({ name: 'Full head', category: null })], 'photo', makeKey);
    expect(again).toMatchObject({ added: 0, alreadyListed: 1 });
    expect(again.drafts).toHaveLength(2);
  });

  it('never changes a service already added or skipped', () => {
    const first = mergeIntoDrafts([], [extracted({ price_pence: null })], 'photo', makeKey);
    first.drafts[0]!.status = 'added';
    const second = mergeIntoDrafts(first.drafts, [extracted()], 'site', makeKey);
    expect(second.drafts[0]!.price).toBe('');
  });
});

describe('draftIssues', () => {
  it('is clean for a complete service', () => {
    const d = draftFromExtracted(extracted(), 's', 'a');
    expect(kinds(d)).toEqual([]);
    expect(draftReadyForBulkAdd(d, draftIssues(d, ctx))).toBe(true);
  });

  it('needs a fix for a missing name, a bad length or a bad price', () => {
    const d = { ...draftFromExtracted(extracted(), 's', 'a'), name: ' ', duration: '2', price: 'abc' };
    expect(kinds(d)).toEqual(['fix:name_missing', 'fix:duration_invalid', 'fix:price_invalid']);
    expect(draftCanBeAdded(draftIssues(d, ctx))).toBe(false);
  });

  it('asks for a check on a guessed length, a missing price, a from price and a price on request', () => {
    const guessed = draftFromExtracted(extracted({ duration_minutes: null, suggested_duration_minutes: 30 }), 's', 'a');
    expect(kinds(guessed)).toContain('check:duration_estimated');
    const noPrice = draftFromExtracted(extracted({ price_pence: null, price_kind: 'not_stated' }), 's', 'b');
    expect(kinds(noPrice)).toEqual(['check:price_missing']);
    const onRequest = draftFromExtracted(extracted({ price_pence: null, price_kind: 'on_request' }), 's', 'c');
    expect(kinds(onRequest)).toEqual(['check:price_on_request']);
    const from = draftFromExtracted(extracted({ price_kind: 'from' }), 's', 'd');
    expect(draftIssues(from, ctx)[0]!.text).toContain('Clients will see £35');
    // A check is not a blocker, but it keeps nothing out of "Add all".
    expect(draftReadyForBulkAdd(noPrice, draftIssues(noPrice, ctx))).toBe(true);
  });

  it('keeps duplicates and extras out of "Add all"', () => {
    const dup = draftFromExtracted(extracted(), 's', 'a');
    const dupCtx = { ...ctx, existingServiceNames: new Set([normaliseServiceName('Cut and blow-dry')]) };
    expect(kinds(dup, dupCtx)).toEqual(['check:duplicate']);
    expect(draftReadyForBulkAdd(dup, draftIssues(dup, dupCtx))).toBe(false);
    const addon = draftFromExtracted(extracted({ name: 'Add a toner', looks_like_addon: true }), 's', 'b');
    expect(draftReadyForBulkAdd(addon, draftIssues(addon, ctx))).toBe(false);
  });

  it('checks each option', () => {
    const d = draftFromExtracted(
      extracted({
        options: [
          { name: 'Short', duration_minutes: 45, price_pence: 3000, description: null },
          { name: '', duration_minutes: 2, price_pence: null, description: null },
        ],
      }),
      's',
      'a',
    );
    d.options[1]!.duration = '2';
    expect(kinds(d)).toEqual(['fix:option_invalid', 'fix:option_invalid', 'check:option_price_missing']);
  });

  it('says when options have no prices, naming the one price the list gave', () => {
    const d = draftFromExtracted(
      extracted({
        price_pence: 6000,
        price_kind: 'from',
        options: [
          { name: 'Short', duration_minutes: 60, price_pence: null, description: null },
          { name: 'Long', duration_minutes: 90, price_pence: null, description: null },
        ],
      }),
      's',
      'a',
    );
    const issue = draftIssues(d, ctx).find((i) => i.kind === 'option_price_missing');
    expect(issue?.text).toContain('Your list gave one price (£60)');
  });

  it('passes the AI notes through as information', () => {
    const d = draftFromExtracted(extracted({ notes: ['Includes 30 minutes of development time.'] }), 's', 'a');
    expect(draftIssues(d, ctx)).toEqual([{ level: 'info', kind: 'note', text: 'Includes 30 minutes of development time.' }]);
  });
});

describe('draftToForm + formToCreateBody', () => {
  it('builds the body the web Add service form sends', () => {
    const d = draftFromExtracted(extracted({ description: 'Wash, cut and finish.' }), 's', 'a');
    const form = draftToForm(d, { categoryId: 'cat-1', calendarIds: ['cal-1', 'cal-2'], colour: '#10B981' });
    const built = formToCreateBody(form);
    expect(built.ok).toBe(true);
    expect(built.ok && built.body).toMatchObject({
      name: 'Cut & Blow Dry',
      description: 'Wash, cut and finish.',
      duration_minutes: 45,
      price_pence: 3500,
      category_id: 'cat-1',
      practitioner_ids: ['cal-1', 'cal-2'],
      colour: '#10B981',
      payment_requirement: 'none',
      variants: [],
      is_bookable_online: true,
    });
  });

  it('turns options into variants, falling back to the service length', () => {
    const d = draftFromExtracted(
      extracted({
        duration_minutes: 60,
        price_pence: null,
        price_kind: 'from',
        options: [
          { name: 'Short hair', duration_minutes: null, price_pence: 4000, description: null },
          { name: 'Long hair', duration_minutes: 90, price_pence: 5500, description: 'Below the shoulders' },
        ],
      }),
      's',
      'a',
    );
    const built = formToCreateBody(draftToForm(d, { categoryId: null, calendarIds: [], colour: '#3B82F6' }));
    expect(built.ok).toBe(true);
    const payload: Record<string, unknown> = built.ok ? built.body : {};
    expect(payload.variants).toEqual([
      expect.objectContaining({ name: 'Short hair', duration_minutes: 60, price_pence: 4000, sort_order: 0, is_active: true }),
      expect.objectContaining({ name: 'Long hair', duration_minutes: 90, price_pence: 5500, description: 'Below the shoulders' }),
    ]);
    // The parent carries the first option's length and price, as the form does.
    expect(payload).toMatchObject({ duration_minutes: 60, price_pence: 4000 });
  });

  it('sends no price when the box is blank', () => {
    const d = draftFromExtracted(extracted({ price_pence: null, price_kind: 'not_stated' }), 's', 'a');
    const built = formToCreateBody(draftToForm(d, { categoryId: null, calendarIds: [], colour: '#3B82F6' }));
    expect(built.ok && built.body.price_pence).toBeUndefined();
  });
});

describe('setup defaults', () => {
  const build = (d: ServiceDraft, defaults: Parameters<typeof draftToForm>[1]['defaults']) =>
    formToCreateBody(draftToForm(d, { categoryId: null, calendarIds: [], colour: '#3B82F6', defaults }));

  it('applies a buffer to the service and every option', () => {
    const d = draftFromExtracted(
      extracted({ options: [{ name: 'A', duration_minutes: 30, price_pence: 3000, description: null }, { name: 'B', duration_minutes: 60, price_pence: 5000, description: null }] }),
      's',
      'a',
    );
    const built = build(d, { bufferMinutes: 10, payment: { kind: 'none' } });
    expect(built.ok && built.body).toMatchObject({ buffer_minutes: 10 });
    expect(built.ok && (built.body.variants as { buffer_minutes: number }[]).map((v) => v.buffer_minutes)).toEqual([10, 10]);
  });

  it('takes a fixed deposit', () => {
    const built = build(draftFromExtracted(extracted(), 's', 'a'), { bufferMinutes: 0, payment: { kind: 'deposit_fixed', amount: '£10' } });
    expect(built.ok && built.body).toMatchObject({ payment_requirement: 'deposit', deposit_pence: 1000 });
  });

  it('takes a percentage deposit from each price, at least £1, and skips a service with no price', () => {
    const priced = build(draftFromExtracted(extracted({ price_pence: 3500 }), 's', 'a'), {
      bufferMinutes: 0,
      payment: { kind: 'deposit_percent', percent: '20' },
    });
    expect(priced.ok && priced.body).toMatchObject({ payment_requirement: 'deposit', deposit_pence: 700 });
    const cheap = build(draftFromExtracted(extracted({ price_pence: 300 }), 's', 'b'), {
      bufferMinutes: 0,
      payment: { kind: 'deposit_percent', percent: '10' },
    });
    expect(cheap.ok && cheap.body.deposit_pence).toBe(100);
    const unpriced = build(draftFromExtracted(extracted({ price_pence: null, price_kind: 'not_stated' }), 's', 'c'), {
      bufferMinutes: 0,
      payment: { kind: 'deposit_percent', percent: '20' },
    });
    expect(unpriced.ok && unpriced.body).toMatchObject({ payment_requirement: 'none', deposit_pence: 0 });
    const withOptions = build(
      draftFromExtracted(
        extracted({ options: [{ name: 'S', duration_minutes: 30, price_pence: 4000, description: null }, { name: 'L', duration_minutes: 60, price_pence: 6000, description: null }] }),
        's',
        'd',
      ),
      { bufferMinutes: 0, payment: { kind: 'deposit_percent', percent: '25' } },
    );
    expect(withOptions.ok && (withOptions.body.variants as { deposit_pence: number }[]).map((v) => v.deposit_pence)).toEqual([1000, 1500]);
  });

  it('charges the full price only when every price is known', () => {
    const priced = build(draftFromExtracted(extracted(), 's', 'a'), { bufferMinutes: 0, payment: { kind: 'full' } });
    expect(priced.ok && priced.body.payment_requirement).toBe('full_payment');
    const partly = build(
      draftFromExtracted(
        extracted({ options: [{ name: 'S', duration_minutes: 30, price_pence: 4000, description: null }, { name: 'L', duration_minutes: 60, price_pence: null, description: null }] }),
        's',
        'b',
      ),
      { bufferMinutes: 0, payment: { kind: 'full' } },
    );
    expect(partly.ok && partly.body.payment_requirement).toBe('none');
  });

  it('ignores an unfinished payment choice', () => {
    expect(paymentDefaultValid({ kind: 'deposit_fixed', amount: '' })).toBe(false);
    expect(paymentDefaultValid({ kind: 'deposit_percent', percent: '0' })).toBe(false);
    expect(paymentDefaultValid({ kind: 'deposit_percent', percent: '101' })).toBe(false);
    const built = build(draftFromExtracted(extracted(), 's', 'a'), { bufferMinutes: 0, payment: { kind: 'deposit_fixed', amount: '' } });
    expect(built.ok && built.body.payment_requirement).toBe('none');
  });
});

describe('updatableDuplicate', () => {
  const existing: ExistingServiceRef[] = [
    { id: 'e1', name: 'Blow Dry', durationMinutes: 45, pricePence: 2500, hasVariants: false },
    { id: 'e2', name: 'Colour', durationMinutes: 90, pricePence: 6000, hasVariants: true },
  ];
  it('offers an update when the length or price changed', () => {
    const d = draftFromExtracted(extracted({ name: 'blow-dry', price_pence: 2800 }), 's', 'a');
    expect(updatableDuplicate(d, existing)?.id).toBe('e1');
  });
  it('does not when nothing changed, when options are involved, or with no match', () => {
    expect(updatableDuplicate(draftFromExtracted(extracted({ name: 'Blow Dry', price_pence: 2500 }), 's', 'a'), existing)).toBeNull();
    expect(updatableDuplicate(draftFromExtracted(extracted({ name: 'Colour' }), 's', 'b'), existing)).toBeNull();
    expect(updatableDuplicate(draftFromExtracted(extracted({ name: 'Nails' }), 's', 'c'), existing)).toBeNull();
  });
});

describe('normaliseStoredDraft', () => {
  it('fills the fields older saves lack', () => {
    const old = { ...draftFromExtracted(extracted(), 's', 'a'), status: 'added' as const, error: 'x' } as Partial<ServiceDraft>;
    delete old.calendarIds;
    delete old.outcome;
    expect(normaliseStoredDraft(old as ServiceDraft)).toMatchObject({ error: null, calendarIds: null, outcome: { kind: 'service' } });
  });
});

describe('draftSummary and formatMinutes', () => {
  it('reads naturally', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 hr');
    expect(formatMinutes(75)).toBe('1 hr 15 min');
    expect(draftSummary(draftFromExtracted(extracted(), 's', 'a'), '£')).toBe('45 min · £35');
    expect(draftSummary(draftFromExtracted(extracted({ price_pence: 0, price_kind: 'free' }), 's', 'b'), '£')).toBe('45 min · Free');
    expect(draftSummary(draftFromExtracted(extracted({ price_pence: null, price_kind: 'not_stated' }), 's', 'c'), '£')).toBe('45 min · No price');
    expect(draftSummary({ ...draftFromExtracted(extracted(), 's', 'e'), price: 'abc' }, '£')).toBe('45 min · Price needs fixing');
    const opts = draftFromExtracted(
      extracted({
        options: [
          { name: 'A', duration_minutes: 30, price_pence: 3000, description: null },
          { name: 'B', duration_minutes: 60, price_pence: 2550, description: null },
        ],
      }),
      's',
      'd',
    );
    expect(draftSummary(opts, '£')).toBe('2 options · from £25.50');
  });
});

describe('formToCreateBody: the rest of the Add service form, at its defaults', () => {
  it('sends every field the web form sends for a new service', () => {
    const built = formToCreateBody(
      draftToForm(draftFromExtracted(extracted(), 's', 'a'), { categoryId: 'cat-1', calendarIds: ['cal-1'], colour: '#10B981' }),
    );
    expect(built.ok && built.body).toEqual({
      name: 'Cut & Blow Dry',
      description: null,
      duration_minutes: 45,
      buffer_minutes: 0,
      price_pence: 3500,
      payment_requirement: 'none',
      deposit_pence: 0,
      colour: '#10B981',
      is_active: true,
      practitioner_ids: ['cal-1'],
      max_advance_booking_days: 90,
      min_booking_notice_hours: 1,
      cancellation_notice_hours: 48,
      allow_same_day_booking: true,
      booking_interval_minutes: 15,
      booking_minute_marks: null,
      booking_start_times: null,
      staff_may_customize_name: false,
      staff_may_customize_description: false,
      staff_may_customize_duration: false,
      staff_may_customize_buffer: false,
      staff_may_customize_price: false,
      staff_may_customize_deposit: false,
      staff_may_customize_colour: false,
      category_id: 'cat-1',
      is_bookable_online: true,
      custom_availability_enabled: false,
      custom_working_hours: null,
      processing_time_blocks: [],
      variants: [],
      addon_group_links: [],
      location_type: 'business_venue',
      online_meeting_url: null,
      online_meeting_info: null,
    });
  });

  it('leaves the price out, not null, when there is none (the API refuses a null price)', () => {
    const built = formToCreateBody(
      draftToForm(draftFromExtracted(extracted({ price_pence: null, price_kind: 'not_stated' }), 's', 'a'), {
        categoryId: null,
        calendarIds: [],
        colour: '#3B82F6',
      }),
    );
    expect(built.ok && 'price_pence' in built.body).toBe(false);
  });

  it('refuses what the web form refuses, in its words', () => {
    const d = draftFromExtracted(extracted(), 's', 'a');
    const form = draftToForm(d, { categoryId: null, calendarIds: [], colour: '#3B82F6' });
    expect(formToCreateBody({ ...form, name: ' ' })).toEqual({ ok: false, error: 'Service name is required' });
    expect(formToCreateBody({ ...form, payment_requirement: 'full_payment', price: '' })).toEqual({
      ok: false,
      error: 'Set a price when charging full payment online',
    });
  });
});

describe('currencySymbolFor and existingSummary', () => {
  it('names the venue currency', () => {
    expect(currencySymbolFor('gbp')).toBe('£');
    expect(currencySymbolFor('EUR')).toBe('€');
    expect(currencySymbolFor(null)).toBe('£');
    expect(currencySymbolFor('CHF')).toBe('CHF ');
  });

  it('summarises a service the venue already has', () => {
    expect(existingSummary({ id: 'e', name: 'Cut', durationMinutes: 45, pricePence: 2500, hasVariants: false }, '£')).toBe('45 min · £25');
    expect(existingSummary({ id: 'e', name: 'Cut', durationMinutes: 60, pricePence: null, hasVariants: false }, '£')).toBe('1 hr · no price');
    expect(existingSummary({ id: 'e', name: 'Cut', durationMinutes: 30, pricePence: 1250, hasVariants: false }, '£')).toBe('30 min · £12.50');
  });
});
