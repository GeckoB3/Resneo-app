/**
 * How each answer sets things up (design 6.4), checked without the screens: what W1 to W7 send
 * through Checkout settings' routes, and that an answer left as it was sends nothing (6.5: "Run
 * set-up again" changes nothing unless an answer changes).
 */
import {
  cardsNeedInPerson,
  cashSettingsFor,
  commissionBodies,
  extrasToSwitchOn,
  floatFromText,
  knowsSellProducts,
  payAnswerFrom,
  paymentTypeWrites,
  productsWithShop,
  quickAddProducts,
  quickProductBody,
  rateFromText,
  sellProductsFact,
  sellProductsOn,
  shopCanOpenNow,
  shopNeedsProducts,
  shopSettingsWrite,
  shopTemplatesOffered,
  teamPresetFrom,
  teamSettingsFor,
  tipRuleFrom,
  tipsAnswerFrom,
  tipsSettingsFor,
  usageAnswerFrom,
  extraStateOf,
  type ShopView,
} from '@/lib/pos/setup/answers';
import { switchesResponse } from '@/lib/pos/switches/test-fixtures';
import type { PosSettingsPaymentType } from '@/types/pos-settings';

const TYPES: PosSettingsPaymentType[] = [
  { id: 'pt-card', name: 'Card (another terminal)', requires_reference: false, is_active: true, sort_order: 0, version: 2 },
  { id: 'pt-bank', name: 'Bank transfer', requires_reference: false, is_active: true, sort_order: 1, version: 3 },
  { id: 'pt-paper', name: 'Paper voucher', requires_reference: false, is_active: true, sort_order: 2, version: 1 },
];

describe('W1: what Checkout is for', () => {
  it('starts from what is on, with an extra on always ticked', () => {
    expect(
      usageAnswerFrom({ answers: {}, sellProducts: true, extrasOn: { vouchers: true, loyalty: false, shop: false } }),
    ).toEqual({ products: true, vouchers: true, loyalty: false, shop: false });
    expect(
      usageAnswerFrom({
        answers: { use: { products: false, vouchers: false, loyalty: true, shop: false } },
        sellProducts: false,
        extrasOn: { vouchers: true, loyalty: false, shop: false },
      }),
    ).toEqual({ products: false, vouchers: true, loyalty: true, shop: false });
  });

  it('reads each extra as on, paused, offered or not shown', () => {
    const res = switchesResponse({
      switches: {
        pos_enabled: { effective: true },
        pos_gift_vouchers_enabled: { effective: true },
        pos_loyalty_enabled: { platform_state: 'blocked' },
        pos_online_shop_enabled: { offered: true, can_switch_on: true },
      },
    });
    expect(extraStateOf(res, 'vouchers')).toBe('on');
    expect(extraStateOf(res, 'loyalty')).toBe('paused');
    expect(extraStateOf(res, 'shop')).toBe('offered');
    expect(extraStateOf(null, 'shop')).toBe('hidden');
  });

  it('keeps "Sell products" on while the shop is on or ticked to come on, and gives the choice back after', () => {
    const own = { products: false, shop: false };
    expect(shopNeedsProducts(own, 'on')).toBe(true);
    expect(productsWithShop(own, 'on')).toBe(true);
    expect(shopNeedsProducts({ ...own, shop: true }, 'offered')).toBe(true);
    expect(productsWithShop({ ...own, shop: true }, 'offered')).toBe(true);
    // The shop unticked again (not on yet): the owner's own choice stands.
    expect(productsWithShop(own, 'offered')).toBe(false);
    expect(productsWithShop({ products: true, shop: false }, 'offered')).toBe(true);
    // Paused by ResNeo, or not offered: the shop holds nothing.
    expect(shopNeedsProducts({ ...own, shop: true }, 'paused')).toBe(false);
    expect(shopNeedsProducts({ ...own, shop: true }, 'hidden')).toBe(false);
  });

  it('switches on only what is ticked, offered and not on yet', () => {
    const res = switchesResponse({
      switches: {
        pos_enabled: { effective: true },
        pos_gift_vouchers_enabled: { effective: true },
        pos_loyalty_enabled: { offered: true, can_switch_on: true },
        pos_online_shop_enabled: { offered: false, can_switch_on: false },
      },
    });
    expect(extrasToSwitchOn({ products: true, vouchers: true, loyalty: true, shop: true }, res)).toEqual(['pos_loyalty_enabled']);
    expect(extrasToSwitchOn({ products: true, vouchers: true, loyalty: false, shop: true }, res)).toEqual([]);
  });

  it('reads "Sell products" as on unless the server says off, and falls back to the answer on an older server', () => {
    expect(sellProductsOn(undefined)).toBe(true);
    expect(sellProductsOn({})).toBe(true);
    expect(sellProductsOn({ sell_products_enabled: false })).toBe(false);
    expect(knowsSellProducts({ sell_products_enabled: true })).toBe(true);
    expect(knowsSellProducts({})).toBe(false);
    expect(sellProductsFact({ sell_products_enabled: false }, { use: { products: true, vouchers: false, loyalty: false, shop: false } })).toBe(false);
    expect(sellProductsFact({}, { use: { products: false, vouchers: false, loyalty: false, shop: false } })).toBe(false);
    expect(sellProductsFact({}, {})).toBe(true);
  });
});

describe('W2: how clients pay', () => {
  it("starts from today's payment types and cash counting", () => {
    expect(
      payAnswerFrom({ answers: {}, paymentTypes: TYPES, settings: { cash_management_enabled: true, default_float_pence: 5000 } }),
    ).toEqual({ card: true, cash: true, transfer: true, other_machine: true, count_cash: true, float_pence: 5000 });
    expect(
      payAnswerFrom({ answers: {}, paymentTypes: [TYPES[0]!], settings: { cash_management_enabled: false } }),
    ).toEqual({ card: true, cash: true, transfer: false, other_machine: true, count_cash: null, float_pence: null });
  });

  it('switches off the types not ticked, never deletes, adds a ticked one that is missing', () => {
    expect(paymentTypeWrites({ transfer: false, other_machine: true }, TYPES)).toEqual({
      update: [{ id: 'pt-bank', version: 3, is_active: false }],
      create: [],
    });
    expect(paymentTypeWrites({ transfer: true, other_machine: true }, TYPES)).toEqual({ update: [], create: [] });
    expect(paymentTypeWrites({ transfer: true, other_machine: false }, [TYPES[2]!])).toEqual({ update: [], create: ['Bank transfer'] });
  });

  it('turns cash counting on with the float, off when only recorded, and sends nothing unchanged', () => {
    const off = { cash_management_enabled: false, default_float_pence: 0 };
    expect(cashSettingsFor({ cash: true, count_cash: true, float_pence: 7500 }, off)).toEqual({
      cash_management_enabled: true,
      default_float_pence: 7500,
    });
    expect(cashSettingsFor({ cash: true, count_cash: false, float_pence: null }, { ...off, cash_management_enabled: true })).toEqual({
      cash_management_enabled: false,
    });
    expect(cashSettingsFor({ cash: true, count_cash: null, float_pence: null }, off)).toEqual({});
    expect(cashSettingsFor({ cash: false, count_cash: true, float_pence: 100 }, off)).toEqual({});
    expect(cashSettingsFor({ cash: true, count_cash: true, float_pence: 7500 }, { cash_management_enabled: true, default_float_pence: 7500 })).toEqual({});
  });

  it('reads the float box', () => {
    expect(floatFromText('')).toBeNull();
    expect(floatFromText('50')).toBe(5000);
    expect(floatFromText('12.5')).toBe(1250);
    expect(Number.isNaN(floatFromText('fifty'))).toBe(true);
  });
});

describe('W3 and W4', () => {
  it('needs card payments in person for a phone or a reader, not for links', () => {
    expect(cardsNeedInPerson('phone')).toBe(true);
    expect(cardsNeedInPerson('reader')).toBe(true);
    expect(cardsNeedInPerson('both')).toBe(true);
    expect(cardsNeedInPerson('links')).toBe(false);
    expect(cardsNeedInPerson(null)).toBe(false);
  });

  it('starts tips from the answer, else from whether tips are on', () => {
    expect(tipsAnswerFrom({ tips: 'unsure' }, { tipping_enabled: true })).toBe('unsure');
    expect(tipsAnswerFrom({}, { tipping_enabled: true })).toBe('yes');
    expect(tipsAnswerFrom({}, { tipping_enabled: false })).toBeNull();
    expect(tipRuleFrom({ tip_allocation_rule: 'operator' })).toBe('operator');
    expect(tipRuleFrom({ tip_allocation_rule: 'manual' })).toBe('pro_rata_services');
  });

  it('turns tips on with the rule and the template policy, off for no or not sure', () => {
    const current = { tipping_enabled: false, tip_allocation_rule: 'pro_rata_services' as const, tipping_policy: null };
    expect(tipsSettingsFor({ tips: 'yes', rule: 'equal_performers', solo: false, policy: 'Our policy', current })).toEqual({
      tipping_enabled: true,
      tip_allocation_rule: 'equal_performers',
      tipping_policy: 'Our policy',
    });
    // One person: the rule stays as it is. A policy already written is never replaced.
    expect(
      tipsSettingsFor({ tips: 'yes', rule: 'operator', solo: true, policy: 'New', current: { ...current, tipping_policy: 'Mine' } }),
    ).toEqual({ tipping_enabled: true });
    expect(tipsSettingsFor({ tips: 'unsure', rule: 'operator', solo: false, policy: null, current: { ...current, tipping_enabled: true } })).toEqual({
      tipping_enabled: false,
    });
    expect(tipsSettingsFor({ tips: 'no', rule: 'operator', solo: false, policy: null, current })).toEqual({});
  });
});

describe('W6: the team', () => {
  const defaults = { create_sale: true, take_payment: true, refund: false, override_price: false };

  it('starts from the answer, else the preset today matches', () => {
    expect(teamPresetFrom({ team: { preset: 'front_desk', commission: null } }, defaults, defaults)).toBe('front_desk');
    expect(teamPresetFrom({}, defaults, defaults)).toBe('team_member');
    expect(teamPresetFrom({}, { ...defaults, refund: true, take_payment: false }, defaults)).toBeNull();
  });

  it("saves the preset's whole map and the limit, only when they change", () => {
    const front = teamSettingsFor({ preset: 'front_desk', limit: 15, stored: defaults, defaults, currentLimit: 10 });
    expect(front.staff_max_discount_percent).toBe(15);
    expect(front.staff_capabilities?.refund).toBe(true);
    expect(front.staff_capabilities?.override_price).toBe(true);
    expect(teamSettingsFor({ preset: 'team_member', limit: 10, stored: defaults, defaults, currentLimit: 10 })).toEqual({});
  });

  it('adds a venue rate for services and products from today, never for vouchers', () => {
    expect(commissionBodies({ services: 10, products: 15 }, '2026-10-11')).toEqual([
      { item_type: 'service', category_id: null, calendar_id: null, staff_id: null, rate_percent: 10, effective_from: '2026-10-11' },
      { item_type: 'product', category_id: null, calendar_id: null, staff_id: null, rate_percent: 15, effective_from: '2026-10-11' },
    ]);
    expect(commissionBodies({ services: null, products: 12.5 }, '2026-10-11')).toHaveLength(1);
    expect(rateFromText('')).toBeNull();
    expect(rateFromText('12,5%')).toBe(12.5);
    expect(Number.isNaN(rateFromText('150'))).toBe(true);
  });
});

describe('W7: quick-add products', () => {
  it('makes one product per name with an option per row, leaving empty rows out', () => {
    const plan = quickAddProducts([
      { key: 'a', name: 'Repair Shampoo', option: '250 ml', price: '18.50' },
      { key: 'b', name: 'repair shampoo', option: '1 litre', price: '42' },
      { key: 'c', name: 'Sea Salt Spray', option: '', price: '£16' },
      { key: 'd', name: '', option: '', price: '' },
    ]);
    expect(plan.errors).toEqual({});
    expect(plan.rows).toBe(3);
    expect(plan.products).toEqual([
      {
        name: 'Repair Shampoo',
        variants: [
          { option_name: '250 ml', price_pence: 1850, sort_order: 0 },
          { option_name: '1 litre', price_pence: 4200, sort_order: 1 },
        ],
      },
      { name: 'Sea Salt Spray', variants: [{ option_name: null, price_pence: 1600, sort_order: 0 }] },
    ]);
    expect(quickProductBody(plan.products[1]!)).toEqual({
      name: 'Sea Salt Spray',
      usage: 'retail',
      sold_in_store: true,
      variants: [{ option_name: null, price_pence: 1600, sort_order: 0, barcodes: [] }],
    });
  });

  it('names the rows that are missing a name or a price', () => {
    const plan = quickAddProducts([
      { key: 'a', name: '', option: '50 ml', price: '5' },
      { key: 'b', name: 'Wax', option: '', price: 'cheap' },
    ]);
    expect(plan.errors).toEqual({ a: 'name', b: 'price' });
    expect(plan.products).toEqual([]);
  });
});

describe('W7: products added here while the online shop is on', () => {
  it('go in the shop too when the tick stays on', () => {
    const product = { name: 'Sea Salt Spray', variants: [{ option_name: null, price_pence: 1600, sort_order: 0 }] };
    expect(quickProductBody(product, { online: true })).toMatchObject({ name: 'Sea Salt Spray', sold_online: true });
    expect(quickProductBody(product, { online: false })).not.toHaveProperty('sold_online');
    expect(quickProductBody(product)).not.toHaveProperty('sold_online');
  });
});

describe('W10: opening the online shop (owner, 2026-10-17)', () => {
  type Checks = ShopView['readiness']['checks'];
  const TEMPLATES = {
    returns: 'Returns at Bloom Hair Studio. Email hello@bloom.example within 30 days.',
    cancellation: 'You can cancel within 14 days of receiving your order.',
    delivery: 'We deliver across the UK.',
    terms: 'These terms are between you and Bloom Hair Studio.',
  };
  function view(over: { checks?: Partial<Checks>; settings?: Record<string, unknown>; placeholders?: { policy: string; placeholder: string }[] } = {}): ShopView {
    const checks: Checks = { legal: true, policies: false, cards: true, plan: true, products: true, fulfilment: true, ...over.checks };
    return {
      settings: {
        shop_open: false,
        returns_policy: null,
        cancellation_policy: null,
        delivery_policy: null,
        terms_of_sale: null,
        version: 5,
        ...over.settings,
      } as unknown as ShopView['settings'],
      readiness: { checks, canOpen: Object.values(checks).every(Boolean), open: false, placeholders: over.placeholders ?? [] },
      templates: TEMPLATES,
    };
  }

  it('offers the templates while a policy is unwritten and the templates have no gap in them', () => {
    expect(shopTemplatesOffered(view())).toBe(true);
    const written = { returns_policy: 'Ours', cancellation_policy: 'Ours', delivery_policy: 'Ours', terms_of_sale: 'Ours' };
    expect(shopTemplatesOffered(view({ settings: written }))).toBe(false);
    // A detail not given yet would leave "[your email]" in a template, keeping the shop shut.
    expect(shopTemplatesOffered({ ...view(), templates: { ...TEMPLATES, returns: 'Email [your email] to return it.' } })).toBe(false);
  });

  it('can open once every line holds, the policies by the templates when they stay ticked', () => {
    expect(shopCanOpenNow(view(), true)).toBe(true);
    expect(shopCanOpenNow(view(), false)).toBe(false);
    expect(shopCanOpenNow(view({ checks: { products: false } }), true)).toBe(false);
    expect(shopCanOpenNow(view({ checks: { policies: true } }), false)).toBe(true);
    // A written policy still holding a gap needs writing over: the templates fill only the empty ones.
    expect(shopCanOpenNow(view({ placeholders: [{ policy: 'terms', placeholder: '[your address]' }] }), true)).toBe(false);
    // Already switched on, there is nothing to open.
    expect(shopCanOpenNow(view({ checks: { policies: true }, settings: { shop_open: true } }), true)).toBe(false);
  });

  it('writes the templates for the empty policies only, and the opening only when it can', () => {
    const some = view({ settings: { returns_policy: 'Our own returns.', terms_of_sale: '  ' } });
    expect(shopSettingsWrite(some, { useTemplates: true, open: true })).toEqual({
      cancellation_policy: TEMPLATES.cancellation,
      delivery_policy: TEMPLATES.delivery,
      terms_of_sale: TEMPLATES.terms,
      shop_open: true,
    });
    expect(shopSettingsWrite(some, { useTemplates: false, open: true })).toEqual({});
    expect(shopSettingsWrite(some, { useTemplates: true, open: false })).not.toHaveProperty('shop_open');
    expect(shopSettingsWrite(view({ checks: { products: false } }), { useTemplates: true, open: true })).not.toHaveProperty('shop_open');
  });
});
