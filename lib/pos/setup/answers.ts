import { parseMoneyInput } from '@/lib/pos/sale-math';
import { presetMap, matchingPreset, type PresetId } from '@/lib/pos/settings-capabilities';
import type { ShopAdminView } from '@/lib/pos/settings-more/types';
import type { PosFeatureSwitchesResponse, PosSwitchExtraKey } from '@/types/pos-switches';
import type { PosSetupAnswers } from '@/types/pos-setup';
import type {
  PosCheckoutSettings,
  PosSettingsCapabilityMap,
  PosSettingsPaymentType,
  PosTipRule,
} from '@/types/pos-settings';

/**
 * How each answer sets things up (design 6.4), as pure functions: what the wizard sends through
 * the routes the web's Settings, Checkout uses (POS settings, payment types, commission rates,
 * products, Part 5's switches). Nothing here writes; the screens send what these return, and the
 * server checks everything again. "Run set-up again" opens with today's values as the answers, so
 * an answer left as it was changes nothing.
 */

// ─── W1: what Checkout is for ───────────────────────────────────────────────

export type UsageAnswer = NonNullable<PosSetupAnswers['use']>;

const EXTRA_FOR: Record<'vouchers' | 'loyalty' | 'shop', PosSwitchExtraKey> = {
  vouchers: 'pos_gift_vouchers_enabled',
  loyalty: 'pos_loyalty_enabled',
  shop: 'pos_online_shop_enabled',
};

/**
 * W1's ticks to start from: what is on today ("Sell products" and the extras), with the saved
 * answer for an extra that is not on yet (ticked before, its switch refused).
 */
export function usageAnswerFrom(input: {
  answers: PosSetupAnswers;
  /** `sellProductsFact`: the setting, or the saved answer on a server before OB3. */
  sellProducts: boolean;
  extrasOn: { vouchers: boolean; loyalty: boolean; shop: boolean };
}): UsageAnswer {
  const saved = input.answers.use;
  // An extra that is on stays ticked whatever was answered: W1 never switches one off.
  return {
    products: input.sellProducts,
    vouchers: input.extrasOn.vouchers || (saved?.vouchers ?? false),
    loyalty: input.extrasOn.loyalty || (saved?.loyalty ?? false),
    shop: input.extrasOn.shop || (saved?.shop ?? false),
  };
}

/** How W1 shows one extra: on (ticked, fixed), paused by ResNeo, offered (a tick), or not at all. */
export type ExtraState = 'on' | 'paused' | 'offered' | 'hidden';

export function extraStateOf(res: PosFeatureSwitchesResponse | null | undefined, extra: 'vouchers' | 'loyalty' | 'shop'): ExtraState {
  const v = res?.switches?.[EXTRA_FOR[extra]];
  if (!v) return 'hidden';
  if (v.effective) return 'on';
  if (v.platform_state === 'blocked' || (v.venue_choice && !v.effective)) return 'paused';
  if (v.offered && v.can_switch_on) return 'offered';
  return 'hidden';
}

/**
 * The online shop sells the venue's products, so "Sell products" stays on while the shop is on, or
 * ticked to come on now (owner decision, Part 4; the server refuses switching it off then, 409
 * `POS_FEATURE_IN_USE`). Unticking a shop that is not on yet gives the owner's own choice back.
 */
export function shopNeedsProducts(use: Pick<UsageAnswer, 'shop'>, shopState: ExtraState): boolean {
  return shopState === 'on' || (shopState === 'offered' && use.shop);
}

/** What W1 saves for "Sell products": the owner's choice, or on while the shop needs it. */
export function productsWithShop(use: Pick<UsageAnswer, 'products' | 'shop'>, shopState: ExtraState): boolean {
  return use.products || shopNeedsProducts(use, shopState);
}

/** The extras W1 switches on: ticked, offered, and not on yet (in the landing's order). */
export function extrasToSwitchOn(use: UsageAnswer, res: PosFeatureSwitchesResponse | null | undefined): PosSwitchExtraKey[] {
  return (['vouchers', 'loyalty', 'shop'] as const)
    .filter((extra) => use[extra] && extraStateOf(res, extra) === 'offered')
    .map((extra) => EXTRA_FOR[extra]);
}

/** "Sell products" from the settings: a server before OB3 sends nothing, which reads as on. */
export function sellProductsOn(settings: { sell_products_enabled?: boolean } | null | undefined): boolean {
  return settings?.sell_products_enabled !== false;
}

/** Whether the server has "Sell products" at all (OB3): a server before it sends no key. */
export function knowsSellProducts(settings: { sell_products_enabled?: boolean } | null | undefined): boolean {
  return typeof settings?.sell_products_enabled === 'boolean';
}

/**
 * "Sell products" as the wizard reads it: the setting where the server has it (W1 writes it), else
 * the owner's answer, so a server before OB3 still leaves W7 out for an owner who said no.
 */
export function sellProductsFact(
  settings: { sell_products_enabled?: boolean } | null | undefined,
  answers: PosSetupAnswers | null | undefined,
): boolean {
  return knowsSellProducts(settings) ? sellProductsOn(settings) : (answers?.use?.products ?? true);
}

// ─── W2: how clients pay ────────────────────────────────────────────────────

export type PayAnswer = NonNullable<PosSetupAnswers['pay']>;

/** The seeded payment types W2 turns on and off by name (the web's `SUGGESTED_PAYMENT_TYPES`). */
export const TRANSFER_TYPE = 'Bank transfer';
export const OTHER_MACHINE_TYPE = 'Card (another terminal)';

function typeNamed(types: readonly PosSettingsPaymentType[], name: string): PosSettingsPaymentType | null {
  const want = name.trim().toLowerCase();
  return types.find((t) => t.name.trim().toLowerCase() === want) ?? null;
}

/** W2's ticks to start from: the saved answer, else today's payment types and cash counting. */
export function payAnswerFrom(input: {
  answers: PosSetupAnswers;
  paymentTypes: readonly PosSettingsPaymentType[];
  settings: Pick<PosCheckoutSettings, 'cash_management_enabled' | 'default_float_pence'>;
}): PayAnswer {
  if (input.answers.pay) return input.answers.pay;
  const counting = input.settings.cash_management_enabled === true;
  return {
    card: true,
    cash: true,
    transfer: typeNamed(input.paymentTypes, TRANSFER_TYPE)?.is_active === true,
    other_machine: typeNamed(input.paymentTypes, OTHER_MACHINE_TYPE)?.is_active === true,
    count_cash: counting ? true : null,
    float_pence: counting ? (input.settings.default_float_pence ?? null) : null,
  };
}

/**
 * The payment type writes W2 makes (design 6.4): "Bank transfer" and "Card (another terminal)" stay
 * on when ticked and go off when not, never deleted; a ticked one that is missing (renamed or
 * removed) is added again. Only changes are sent.
 */
export function paymentTypeWrites(
  pay: Pick<PayAnswer, 'transfer' | 'other_machine'>,
  types: readonly PosSettingsPaymentType[],
): { update: { id: string; version: number; is_active: boolean }[]; create: string[] } {
  const update: { id: string; version: number; is_active: boolean }[] = [];
  const create: string[] = [];
  for (const [name, wanted] of [
    [TRANSFER_TYPE, pay.transfer],
    [OTHER_MACHINE_TYPE, pay.other_machine],
  ] as const) {
    const row = typeNamed(types, name);
    if (!row) {
      if (wanted) create.push(name);
      continue;
    }
    if (row.is_active !== wanted) update.push({ id: row.id, version: row.version, is_active: wanted });
  }
  return { update, create };
}

/**
 * The cash settings W2 writes: "Yes, help me count it" turns counting on with the usual float
 * (blind close stays as it is); "No, just record it" turns it off. Nothing when cash is not ticked
 * or the question is not answered, or when nothing would change.
 */
export function cashSettingsFor(
  pay: Pick<PayAnswer, 'cash' | 'count_cash' | 'float_pence'>,
  current: Pick<PosCheckoutSettings, 'cash_management_enabled' | 'default_float_pence'>,
): Partial<PosCheckoutSettings> {
  if (!pay.cash || pay.count_cash === null) return {};
  const out: Partial<PosCheckoutSettings> = {};
  if (current.cash_management_enabled !== pay.count_cash) out.cash_management_enabled = pay.count_cash;
  if (pay.count_cash && pay.float_pence !== null && pay.float_pence !== (current.default_float_pence ?? 0)) {
    out.default_float_pence = pay.float_pence;
  }
  return out;
}

/** A float typed in the box: empty is no float, else pence, or NaN when it isn't an amount. */
export function floatFromText(text: string): number | null {
  if (!text.trim()) return null;
  return parseMoneyInput(text) ?? Number.NaN;
}

// ─── W3: taking cards ───────────────────────────────────────────────────────

export type CardsAnswer = NonNullable<PosSetupAnswers['cards']>;

/** A phone or a reader needs card payments in person on (`PATCH /api/venue`, design 6.4). */
export function cardsNeedInPerson(cards: CardsAnswer | null | undefined): boolean {
  return cards === 'phone' || cards === 'reader' || cards === 'both';
}

export function cardsUsePhone(cards: CardsAnswer | null | undefined): boolean {
  return cards === 'phone' || cards === 'both';
}

export function cardsUseReader(cards: CardsAnswer | null | undefined): boolean {
  return cards === 'reader' || cards === 'both';
}

// ─── W4: tips ───────────────────────────────────────────────────────────────

export type TipsAnswer = NonNullable<PosSetupAnswers['tips']>;

/** The three ways W4 offers; "Choose at each sale" stays in Checkout settings. */
export const WIZARD_TIP_RULES: readonly PosTipRule[] = ['pro_rata_services', 'equal_performers', 'operator'];

export function tipsAnswerFrom(answers: PosSetupAnswers, settings: Pick<PosCheckoutSettings, 'tipping_enabled'>): TipsAnswer | null {
  return answers.tips ?? (settings.tipping_enabled ? 'yes' : null);
}

/** The rule W4 shows chosen: today's, when it is one of the three, else the recommended one. */
export function tipRuleFrom(settings: Pick<PosCheckoutSettings, 'tip_allocation_rule'>): PosTipRule {
  return WIZARD_TIP_RULES.includes(settings.tip_allocation_rule) ? settings.tip_allocation_rule : 'pro_rata_services';
}

/**
 * The tips settings W4 writes (design 6.4): "Yes" turns tipping on with the sharing rule (a
 * one-person business keeps today's, as tips go to them) and the template policy when asked for and
 * none is written yet; "No" or "Not sure yet" turn it off. Only changes are sent; the suggestions
 * keep their defaults (10%, 15%, 20%; £1, £2, £3).
 */
export function tipsSettingsFor(input: {
  tips: TipsAnswer;
  rule: PosTipRule;
  solo: boolean;
  policy: string | null;
  current: Pick<PosCheckoutSettings, 'tipping_enabled' | 'tip_allocation_rule' | 'tipping_policy'>;
}): Partial<PosCheckoutSettings> {
  const out: Partial<PosCheckoutSettings> = {};
  const on = input.tips === 'yes';
  if (input.current.tipping_enabled !== on) out.tipping_enabled = on;
  if (on && !input.solo && input.current.tip_allocation_rule !== input.rule) out.tip_allocation_rule = input.rule;
  if (on && input.policy && !input.current.tipping_policy?.trim()) out.tipping_policy = input.policy;
  return out;
}

// ─── W6: the team ───────────────────────────────────────────────────────────

export type TeamPreset = 'team_member' | 'front_desk';

export function presetIdFor(preset: TeamPreset): PresetId {
  return preset === 'front_desk' ? 'frontDesk' : 'team';
}

/** W6's preset to start from: the saved answer, else the preset today's map matches (or none). */
export function teamPresetFrom(
  answers: PosSetupAnswers,
  stored: PosSettingsCapabilityMap,
  defaults: PosSettingsCapabilityMap,
): TeamPreset | null {
  if (answers.team?.preset) return answers.team.preset;
  const match = matchingPreset(stored, defaults);
  return match === 'frontDesk' ? 'front_desk' : match === 'team' ? 'team_member' : null;
}

/**
 * The team settings W6 writes: the chosen preset's whole map (as Checkout settings' preset cards
 * save it) and the discount limit. Only what changes is sent.
 */
export function teamSettingsFor(input: {
  preset: TeamPreset | null;
  limit: number;
  stored: PosSettingsCapabilityMap;
  defaults: PosSettingsCapabilityMap;
  currentLimit: number;
}): Partial<PosCheckoutSettings> {
  const out: Partial<PosCheckoutSettings> = {};
  if (input.preset) {
    const map = presetMap(presetIdFor(input.preset), input.defaults);
    const changed = Object.keys({ ...map, ...input.stored }).some((k) => Boolean(map[k]) !== Boolean(input.stored[k]));
    if (changed) out.staff_capabilities = map;
  }
  if (input.limit !== input.currentLimit) out.staff_max_discount_percent = input.limit;
  return out;
}

/** A commission rate typed as a percentage: null when empty, NaN when not 0 to 100. */
export function rateFromText(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/%$/, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : Number.NaN;
}

/**
 * The commission rates W6 adds (design 6.4): one venue rate for services and one for products,
 * from today, through `POST /api/venue/pos/commission/rates`. Vouchers stay at nothing (D48).
 */
export function commissionBodies(
  rates: { services: number | null; products: number | null },
  today: string,
): { item_type: 'service' | 'product'; category_id: null; calendar_id: null; staff_id: null; rate_percent: number; effective_from: string }[] {
  const out: ReturnType<typeof commissionBodies> = [];
  for (const [itemType, rate] of [
    ['service', rates.services],
    ['product', rates.products],
  ] as const) {
    if (rate === null || !Number.isFinite(rate)) continue;
    out.push({ item_type: itemType, category_id: null, calendar_id: null, staff_id: null, rate_percent: rate, effective_from: today });
  }
  return out;
}

// ─── W7: quick-add products ────────────────────────────────────────────────

export interface QuickRow {
  key: string;
  name: string;
  option: string;
  price: string;
}

export interface QuickProduct {
  name: string;
  variants: { option_name: string | null; price_pence: number; sort_order: number }[];
}

/**
 * The products W7's quick-add creates: rows with the same name (in any case) become one product
 * with an option per row, as the import does (design 6.3). A row with nothing typed is left out; a
 * row missing its name or with a price that isn't an amount is named in `errors`, and nothing is
 * sent until every row is right.
 */
export function quickAddProducts(rows: readonly QuickRow[]): {
  products: QuickProduct[];
  errors: Record<string, 'name' | 'price'>;
  rows: number;
} {
  const errors: Record<string, 'name' | 'price'> = {};
  const byName = new Map<string, QuickProduct>();
  let count = 0;
  for (const row of rows) {
    const name = row.name.trim();
    const option = row.option.trim();
    const priceText = row.price.trim();
    if (!name && !option && !priceText) continue;
    if (!name) {
      errors[row.key] = 'name';
      continue;
    }
    const price = parseMoneyInput(priceText);
    if (price === null || price > 2_000_000) {
      errors[row.key] = 'price';
      continue;
    }
    count += 1;
    const key = name.toLowerCase();
    const product = byName.get(key) ?? { name, variants: [] };
    product.variants.push({ option_name: option || null, price_pence: price, sort_order: product.variants.length });
    byName.set(key, product);
  }
  return { products: [...byName.values()], errors, rows: count };
}

/** A new empty quick-add row. */
export function emptyQuickRow(key: string): QuickRow {
  return { key, name: '', option: '', price: '' };
}

/**
 * The body `POST /api/venue/retail/products` takes for a quick-added product; `online` puts it in
 * the online shop too ("Sell these in my online shop too", while the shop is on).
 */
export function quickProductBody(product: QuickProduct, opts: { online?: boolean } = {}): Record<string, unknown> {
  return {
    name: product.name,
    usage: 'retail',
    sold_in_store: true,
    ...(opts.online ? { sold_online: true } : {}),
    variants: product.variants.map((v) => ({ option_name: v.option_name, price_pence: v.price_pence, sort_order: v.sort_order, barcodes: [] })),
  };
}

// ─── W10: opening the online shop (owner, 2026-10-17) ───────────────────────

/** Each policy's column and its template in the shop's view, in the checklist's order. */
const SHOP_POLICIES = [
  ['returns_policy', 'returns'],
  ['cancellation_policy', 'cancellation'],
  ['delivery_policy', 'delivery'],
  ['terms_of_sale', 'terms'],
] as const;

/** A "[your ...]" gap our templates leave for a detail not given yet (the web's `policyPlaceholder`). */
const POLICY_PLACEHOLDER = /\[\s*your\s[^\]\n]{0,60}\]/i;

export type ShopView = Pick<ShopAdminView, 'settings' | 'readiness' | 'templates'>;

const unwritten = (view: ShopView) => SHOP_POLICIES.filter(([column]) => !view.settings[column]?.trim());

/**
 * "Use our templates" is offered while a policy is still unwritten and the templates have no
 * "[your ...]" gap left in them: a gap keeps the shop shut until someone writes over it, so those
 * templates are left to Online shop settings, where the owner reads them.
 */
export function shopTemplatesOffered(view: ShopView): boolean {
  return (
    unwritten(view).length > 0 &&
    SHOP_POLICIES.every(([, template]) => {
      const text = view.templates?.[template];
      return typeof text === 'string' && !POLICY_PLACEHOLDER.test(text);
    })
  );
}

/**
 * Whether "Yes, open my shop" can be chosen: the shop is shut and every line of its checklist holds,
 * the policies by the templates when the owner keeps them ticked (a policy already written with a
 * "[your ...]" gap in it still needs writing over).
 */
export function shopCanOpenNow(view: ShopView, useTemplates: boolean): boolean {
  if (view.settings.shop_open) return false;
  const c = view.readiness.checks;
  const policies = c.policies || (useTemplates && shopTemplatesOffered(view) && (view.readiness.placeholders ?? []).length === 0);
  return c.legal && policies && c.cards && c.plan && c.products && c.fulfilment;
}

/**
 * What W10 sends to the shop's own settings route in one save: the templates for the policies not
 * written yet, and `shop_open` when the owner chose to open now and the shop can. The server checks
 * the shop as it will be after the save, so an opening it cannot take is refused, never half done.
 */
export function shopSettingsWrite(view: ShopView, choice: { useTemplates: boolean; open: boolean }): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  if (choice.useTemplates && shopTemplatesOffered(view)) {
    for (const [column, template] of unwritten(view)) out[column] = view.templates[template];
  }
  if (choice.open && shopCanOpenNow(view, choice.useTemplates)) out.shop_open = true;
  return out;
}
