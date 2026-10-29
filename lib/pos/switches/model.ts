import { formatPence } from '@/lib/format';
import type { SwitchRefusal } from '@/lib/pos/switches/api';
import { alsoCheckoutSentence, extraShort, swT, switchName, type SwitchCopyId } from '@/lib/pos/switches/copy';
import type { PosBootstrap } from '@/types/pos';
import {
  POS_SWITCH_EXTRA_KEYS,
  POS_SWITCH_KEYS,
  type PosFeatureSwitchesResponse,
  type PosSwitchBlockingItem,
  type PosSwitchExtraKey,
  type PosSwitchHistoryRow,
  type PosSwitchInUse,
  type PosSwitchKey,
  type PosSwitchOffer,
  type PosSwitchUnavailableReason,
} from '@/types/pos-switches';
import type { VenueBootstrap, VenueFeatureFlagsRaw } from '@/types/venue';

/**
 * What the switch screens show, worked out without rendering (POS Part 5, design sections 6, 7.2,
 * 7.3, 10, 12 and 14), so each rule is tested on its own. Where the web has the same rule (the door,
 * what is left to finish, the off dialog's lines) it is written the same way.
 */

// ─── The landing (design section 14 steps 2 and 8) ────────────────────────

export type LandingState =
  /** A team member: "Ask an admin to switch on Checkout." */
  | { kind: 'staff' }
  /** The admin can switch Checkout on now. */
  | { kind: 'available' }
  /** ResNeo paused it for this venue, with its public reason when it gave one. */
  | { kind: 'paused'; publicReason: string | null }
  /** The environment switch: paused for everyone. */
  | { kind: 'environment' }
  | { kind: 'currency' }
  | { kind: 'billing' }
  /** Not offered yet, or not eligible for another reason (the plan, onboarding). */
  | { kind: 'unavailable' }
  /** The switches say Checkout is on, though the venue the app holds says off: read it again. */
  | { kind: 'on' };

function stateForReason(reason: PosSwitchUnavailableReason | null, publicReason: string | null): LandingState {
  switch (reason) {
    case 'currency':
      return { kind: 'currency' };
    case 'billing':
      return { kind: 'billing' };
    case 'environment':
      return { kind: 'environment' };
    case 'blocked':
      return { kind: 'paused', publicReason };
    default:
      return { kind: 'unavailable' };
  }
}

/**
 * The landing's state while Checkout is off. The offer from `GET /api/venue` decides at once; the
 * switches' own state, once loaded, has the last word (it is read fresh, the venue may be a minute
 * old). Team members never see the landing (SW1).
 */
export function landingState(input: {
  isAdmin: boolean;
  offer: PosSwitchOffer;
  switches?: PosFeatureSwitchesResponse | null;
}): LandingState {
  if (!input.isAdmin) return { kind: 'staff' };
  const res = input.switches;
  const pos = res?.switches?.pos_enabled;
  if (res && pos) {
    if (pos.effective) return { kind: 'on' };
    if (res.environment_off) return { kind: 'environment' };
    if (pos.platform_state === 'blocked') return { kind: 'paused', publicReason: pos.public_reason };
    if (pos.can_switch_on) return { kind: 'available' };
    return stateForReason(pos.unavailable_reason, pos.public_reason);
  }
  const { offer } = input;
  if (offer.state === 'available') return { kind: 'available' };
  if (offer.state === 'paused') {
    return offer.reason === 'environment' ? { kind: 'environment' } : { kind: 'paused', publicReason: offer.public_reason };
  }
  return stateForReason(offer.reason, offer.public_reason);
}

/** A public reason as a full sentence, so "{publicReason} You can still..." reads right. */
function asSentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** "ResNeo has paused Checkout for {venue}: {publicReason} ...", or without a reason when none was given. */
export function pausedSentence(venueName: string, publicReason: string | null): string {
  const reason = publicReason?.trim();
  if (!reason) return swT('sw.na.paused.bodyNoReason', { venue: venueName });
  return swT('sw.na.paused.body', { venue: venueName, publicReason: asSentence(reason) });
}

/**
 * The extras the landing offers as ticks (A2: only those the dial offers): offered, not paused by
 * ResNeo, and possible once Checkout comes on with them.
 */
export function landingExtras(res: PosFeatureSwitchesResponse | null | undefined): PosSwitchExtraKey[] {
  if (!res?.switches) return [];
  return POS_SWITCH_EXTRA_KEYS.filter((key) => {
    const v = res.switches[key];
    if (!v || !v.offered || v.platform_state === 'blocked' || v.effective) return false;
    return v.can_switch_on || v.unavailable_reason === 'needs_checkout';
  });
}

// ─── Switching on (step 3, SW4, SW8) ──────────────────────────────────────

export interface SwitchOnStep {
  feature: PosSwitchKey;
  /** Switch Checkout on in the same call (SW4). */
  alsoCheckout: boolean;
}

/**
 * The calls "Switch on and set up" makes, in order (as the web's `SwitchOnDialog`). With no extras
 * ticked, Checkout alone. With extras, the first one brings Checkout with it (`also_checkout`, SW4)
 * and the others follow, each sent with the version the last answer gave.
 */
export function switchOnSteps(ticked: readonly PosSwitchExtraKey[]): SwitchOnStep[] {
  const extras = POS_SWITCH_EXTRA_KEYS.filter((key) => ticked.includes(key));
  if (extras.length === 0) return [{ feature: 'pos_enabled', alsoCheckout: false }];
  return extras.map((feature, i) => ({ feature, alsoCheckout: i === 0 }));
}

/** The line that Checkout comes with the first extra ticked (SW4; the web's `alsoCheckoutSentence`). */
export function alsoCheckoutLine(ticked: readonly PosSwitchExtraKey[]): string | null {
  const first = POS_SWITCH_EXTRA_KEYS.find((key) => ticked.includes(key));
  return first ? alsoCheckoutSentence(first) : null;
}

/** The seller's tick box is asked for at the venue's first switch-on only (SW8). */
export function needsSellerTick(res: PosFeatureSwitchesResponse | null | undefined): boolean {
  return res ? !res.terms_accepted : true;
}

/** The extras named in Checkout settings' `?missed=` after switching on: the ones that did not come on. */
export function parseMissedExtras(value: string | string[] | undefined): PosSwitchExtraKey[] {
  const text = Array.isArray(value) ? value.join(',') : (value ?? '');
  return POS_SWITCH_EXTRA_KEYS.filter((key) => text.split(',').map((s) => s.trim()).includes(key));
}

/** "gift vouchers", "gift vouchers, loyalty card and online shop" (the web's `joinFeatures`). */
export function extrasForSentence(keys: readonly PosSwitchExtraKey[]): string {
  const names = keys.map((key) => switchName(key).toLowerCase());
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ─── Checkout settings: the extras group (step 6) ─────────────────────────

export interface ExtraRow {
  key: PosSwitchExtraKey;
  status: 'on' | 'off' | 'paused';
  /** The switch's position. */
  value: boolean;
  /** Whether the switch can move: on can always go off; off goes on only when it may. */
  canChange: boolean;
  /** ResNeo's sentence while it paused this extra. */
  publicReason: string | null;
  /** Why it cannot be switched on, when off and offered but refused. */
  reason: PosSwitchUnavailableReason | null;
}

/**
 * The extras under "Checkout is on": on (switch it off), off (switch it on, while the dial offers
 * it) or paused by ResNeo (no switch). An extra that is off and not offered is left out, as on the
 * landing.
 */
export function extraRows(res: PosFeatureSwitchesResponse | null | undefined): ExtraRow[] {
  if (!res?.switches) return [];
  const rows: ExtraRow[] = [];
  for (const key of POS_SWITCH_EXTRA_KEYS) {
    const v = res.switches[key];
    if (!v) continue;
    if (v.platform_state === 'blocked' || (v.venue_choice && !v.effective)) {
      rows.push({ key, status: 'paused', value: false, canChange: false, publicReason: v.public_reason, reason: v.unavailable_reason });
      continue;
    }
    if (v.effective) {
      rows.push({ key, status: 'on', value: true, canChange: true, publicReason: null, reason: null });
      continue;
    }
    if (!v.offered) continue;
    rows.push({
      key,
      status: 'off',
      value: false,
      canChange: v.can_switch_on,
      publicReason: null,
      reason: v.can_switch_on ? null : v.unavailable_reason,
    });
  }
  return rows;
}

/** The sentence for a reason a switch cannot come on (the web's `unavailableSentence`), or null. */
export function extraReasonSentence(reason: PosSwitchUnavailableReason | null, venueName: string): string | null {
  switch (reason) {
    case null:
      return null;
    case 'currency':
      return swT('sw.na.currency');
    case 'billing':
      return swT('app.sw.na.billing');
    case 'environment':
      return swT('sw.na.env');
    default:
      return swT('sw.na.other', { venue: venueName });
  }
}

/**
 * What a refused switch says (the web's dialogs' `explain`): the ticks the server still asks for,
 * someone else's change, the admin check, why it cannot come on, no answer, or the server's own
 * sentence. Money still moving (`in_use`) is shown as the sales that block it, so it has no line.
 */
export function switchRefusalSentence(refusal: SwitchRefusal, venueName: string): string | null {
  switch (refusal.kind) {
    case 'not_admin':
      return swT('sw.error.notAdmin');
    case 'stale':
      return swT('sw.error.stale');
    case 'needs_ack':
      return refusal.needs.includes('stored_value_outstanding') ? swT('sw.off.ackNeeded') : swT('sw.on.ackNeeded');
    case 'not_available':
      return refusal.reason === 'blocked'
        ? pausedSentence(venueName, refusal.publicReason)
        : (extraReasonSentence(refusal.reason, venueName) ?? swT('sw.na.other', { venue: venueName }));
    case 'in_use':
      return null;
    case 'network':
      return swT('sw.error.network');
    default:
      return refusal.message ?? swT('sw.error.save');
  }
}

// ─── An extra's own settings while it is off ──────────────────────────────

export type ExtraOffState =
  /** Offered: the admin switches it on in Checkout settings, under Extras. */
  | { kind: 'switch_on' }
  /** ResNeo paused it for this venue (or for everyone). */
  | { kind: 'paused'; publicReason: string | null }
  /** Not offered yet, or refused for a reason; nothing promises it will come on. */
  | { kind: 'unavailable'; reason: PosSwitchUnavailableReason | null };

/**
 * What an extra's settings screen says while the extra is off, for an admin (team members are told
 * an admin can switch it on). Unreadable switches (a server without them) say it isn't available,
 * and never promise that support will turn it on.
 */
export function extraOffState(res: PosFeatureSwitchesResponse | null | undefined, key: PosSwitchExtraKey): ExtraOffState {
  const v = res?.switches?.[key];
  if (!v) return { kind: 'unavailable', reason: null };
  if (v.platform_state === 'blocked') return { kind: 'paused', publicReason: v.public_reason };
  if (v.effective || v.can_switch_on) return { kind: 'switch_on' };
  if (v.unavailable_reason === 'environment' || v.venue_choice) return { kind: 'paused', publicReason: null };
  return { kind: 'unavailable', reason: v.unavailable_reason };
}

/** The sentence under an extra's "switched off" title, from its state (or for a team member). */
export function extraOffSentence(state: ExtraOffState | 'staff', venueName: string): string {
  if (state === 'staff') return swT('app.sw.gate.staff');
  switch (state.kind) {
    case 'switch_on':
      return swT('app.sw.gate.switchOn');
    case 'paused': {
      const reason = state.publicReason?.trim();
      return reason ? swT('app.sw.gate.paused', { publicReason: asSentence(reason) }) : swT('app.sw.gate.pausedNoReason');
    }
    default:
      switch (state.reason) {
        case 'currency':
        case 'billing':
        case 'environment':
          return extraReasonSentence(state.reason, venueName) ?? swT('app.sw.gate.notYet');
        default:
          return swT('app.sw.gate.notYet');
      }
  }
}

// ─── Switching off (step 7, SW5, section 7.3) ─────────────────────────────

/** The off sheet's title, opening line and keep button, as the web's `SwitchOffDialog` names them. */
export function offSheetCopy(feature: PosSwitchKey): { title: SwitchCopyId; body: SwitchCopyId; keep: SwitchCopyId } {
  if (feature === 'pos_enabled') return { title: 'sw.off.title', body: 'sw.off.body', keep: 'sw.off.keep' };
  const short = extraShort(feature);
  return { title: `sw.extraOff.${short}.title`, body: `sw.extraOff.${short}.body`, keep: 'sw.extraOff.keep' };
}

export interface OffRefusal {
  kind: PosSwitchBlockingItem['kind'];
  saleId: string;
  text: string;
  /** "Open sale 12". */
  linkLabel: string;
}

export type OffWarningKey = 'till' | 'open' | 'partPaid' | 'links' | 'orders' | 'rewards';

export interface OffWarning {
  key: OffWarningKey;
  text: string;
}

export interface OffSheetModel {
  /** Money is moving: switching off is refused until these are finished or cancelled. */
  refusals: OffRefusal[];
  warnings: OffWarning[];
  /** Vouchers or credit with money left: the sentence above "We'll still honour these" (a tick is needed). */
  storedValue: string | null;
  /** Rewards waiting while the loyalty card is on: offer "Pause the loyalty card instead". */
  offerPauseLoyalty: boolean;
}

/** "14 October", or "14 October 2027" outside this year, in the venue's time zone. */
export function switchDay(iso: string | null | undefined, timeZone: string, now: Date = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    const year = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(at);
    const thisYear = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone }).format(now);
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      ...(year === thisYear ? {} : { year: 'numeric' }),
      timeZone,
    }).format(at);
  } catch {
    return '';
  }
}

/** "10:04" in the venue's time zone. */
export function switchTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at);
  } catch {
    return '';
  }
}

/** A refusal's sentence and link, by its sale number (the web's words when there is none). */
export function offRefusal(item: PosSwitchBlockingItem): OffRefusal {
  const phone = item.kind === 'sale_waiting_on_phone';
  const n = item.sale_number;
  return {
    kind: item.kind,
    saleId: item.sale_id,
    text:
      n == null
        ? swT(phone ? 'sw.off.blocked.phoneNoNumber' : 'sw.off.blocked.paymentNoNumber')
        : swT(phone ? 'sw.off.blocked.phone' : 'sw.off.blocked.payment', { saleNo: n }),
    linkLabel: n == null ? swT('sw.off.link.saleNoNumber') : swT('sw.off.link.sale', { saleNo: n }),
  };
}

/**
 * What the off sheet says for one switch (SW5, as the web's `SwitchOffDialog`): Checkout is refused
 * only while money is moving and warns with counts for the rest; gift vouchers and Checkout need
 * the tick while clients hold money on vouchers or credit; loyalty and Checkout warn about rewards
 * waiting, offering to pause the card instead while it is on; the shop and Checkout warn about
 * orders still to finish. ResNeo's own off is never refused (that is the super console's).
 */
export function offSheetModel(
  feature: PosSwitchKey,
  inUse: PosSwitchInUse | null | undefined,
  opts: { timeZone: string; now?: Date; loyaltyOn?: boolean },
): OffSheetModel {
  const model: OffSheetModel = { refusals: [], warnings: [], storedValue: null, offerPauseLoyalty: false };
  const u = inUse;
  if (!u) return model;
  const isCheckout = feature === 'pos_enabled';
  const amount = formatPence(u.stored_value_outstanding_pence) ?? '';

  if (isCheckout) {
    model.refusals = (u.blocking ?? []).map(offRefusal);
    if (u.till_open) model.warnings.push({ key: 'till', text: swT('sw.off.warn.till') });
    if (u.open_sales > 0) model.warnings.push({ key: 'open', text: swT('sw.off.warn.open', { count: u.open_sales }) });
    if (u.part_paid_sales > 0) model.warnings.push({ key: 'partPaid', text: swT('sw.off.warn.partPaid', { count: u.part_paid_sales }) });
    if (u.unpaid_pay_links > 0) {
      const date = switchDay(u.pay_links_last_expires_at, opts.timeZone, opts.now);
      model.warnings.push({
        key: 'links',
        text: date
          ? swT('sw.off.warn.links', { count: u.unpaid_pay_links, date })
          : swT('sw.off.warn.linksNoDate', { count: u.unpaid_pay_links }),
      });
    }
  }
  if ((isCheckout || feature === 'pos_online_shop_enabled') && u.unfinished_orders > 0) {
    model.warnings.push({ key: 'orders', text: swT('sw.off.warn.orders', { count: u.unfinished_orders }) });
  }
  if ((isCheckout || feature === 'pos_gift_vouchers_enabled') && (u.stored_value_count > 0 || u.stored_value_outstanding_pence > 0)) {
    model.storedValue = isCheckout ? swT('sw.off.warn.vouchers', { amount }) : swT('app.sw.extraOff.vouchersHeld', { amount });
  }
  if ((isCheckout || feature === 'pos_loyalty_enabled') && u.rewards_waiting > 0) {
    model.warnings.push({ key: 'rewards', text: swT('sw.off.warn.rewards', { count: u.rewards_waiting }) });
    model.offerPauseLoyalty = feature === 'pos_loyalty_enabled' || opts.loyaltyOn === true;
  }
  return model;
}

/** Whether "Switch off" may be pressed: nothing refuses it, and the vouchers tick is given when asked for. */
export function canConfirmOff(model: OffSheetModel, honoured: boolean): boolean {
  return model.refusals.length === 0 && (model.storedValue === null || honoured);
}

/**
 * Whether something is left to finish once Checkout is off, from the counts read just before (the
 * web's `somethingLeftToFinish`): More then keeps Sales history, and the last line says so.
 */
export function leavesSomethingToFinish(inUse: PosSwitchInUse | null | undefined): boolean {
  if (!inUse) return false;
  return inUse.till_open || inUse.part_paid_sales > 0 || inUse.unpaid_pay_links > 0 || inUse.unfinished_orders > 0;
}

// ─── After a change: what the app shows at once ───────────────────────────

/** The offer the venue has now, from the switches' state (the next read of the venue confirms it). */
export function offerFromSwitches(res: PosFeatureSwitchesResponse): PosSwitchOffer {
  const pos = res.switches.pos_enabled;
  if (pos.effective) return { state: 'on', reason: null, public_reason: null };
  if (res.environment_off) return { state: 'paused', reason: 'environment', public_reason: null };
  if (pos.platform_state === 'blocked') return { state: 'paused', reason: 'blocked', public_reason: pos.public_reason };
  if (pos.can_switch_on) return { state: 'available', reason: null, public_reason: null };
  return { state: 'not_available', reason: pos.unavailable_reason, public_reason: null };
}

/**
 * The venue bootstrap with the four switches as the POST answered, so the Checkout tiles appear (or
 * go) at once instead of after the next read of the venue. The door stays shut until that read: a
 * venue that has just switched Checkout on or off is not pitched again.
 */
export function venueWithSwitches(venue: VenueBootstrap, res: PosFeatureSwitchesResponse): VenueBootstrap {
  const resolved = { ...venue.feature_flags?.resolved };
  const raw: Record<string, unknown> = { ...venue.feature_flags?.raw };
  for (const key of POS_SWITCH_KEYS) {
    const v = res.switches?.[key];
    if (!v) continue;
    resolved[key] = v.effective;
    raw[key] = v.effective;
  }
  return {
    ...venue,
    feature_flags: { raw: raw as VenueFeatureFlagsRaw, resolved },
    feature_offers: { ...(venue.feature_offers ?? {}), pos: offerFromSwitches(res), pos_door: false },
  };
}

// ─── The way back while Checkout is off (section 7.2) ─────────────────────

export interface WayBack {
  orders: boolean;
  ordersNewCount: number | null;
  salesHistory: boolean;
}

export const NO_WAY_BACK: WayBack = { orders: false, ordersNewCount: null, salesHistory: false };

/**
 * While Checkout is off at a venue that has had it (the web's `loadPosWayBack`), More keeps Orders
 * while orders are still to hand over or send (for logins the Orders routes let in), and Sales
 * history for admins while anything is left to finish: orders, an open till, and open or part-paid
 * sales (which carry any pay links still to be paid).
 */
export function wayBack(input: {
  finishing: boolean;
  isAdmin: boolean;
  orders: { newCount: number; unfinishedCount: number } | null | undefined;
  openSales: number | null | undefined;
  tillOpen?: boolean;
}): WayBack {
  if (!input.finishing) return NO_WAY_BACK;
  const unfinished = input.orders?.unfinishedCount ?? 0;
  const open = input.openSales ?? 0;
  return {
    orders: unfinished > 0,
    ordersNewCount: input.orders?.newCount ?? null,
    salesHistory: input.isAdmin && (unfinished > 0 || open > 0 || input.tillOpen === true),
  };
}

/**
 * What Sales history may do with a past sale while Checkout is off, in the shape the sale screen
 * reads (the POS bootstrap, whose route refuses while Checkout is off): an admin may refund money
 * already taken, and nothing else, as the web's read-only Sales history (`readOnlyHistory`). Refund
 * reasons fall back to the defaults, and there are no other payment types to refund to.
 */
export function salesHistoryBootstrap(venue: { name: string; currency: string; timezone: string }, isAdmin: boolean): PosBootstrap {
  return {
    settings: {},
    capabilities: isAdmin ? { refund: true } : {},
    role: isAdmin ? 'admin' : 'staff',
    tills: [],
    payment_types: [],
    discount_presets: [],
    operators: [],
    card_methods: {},
    readers: [],
    venue,
    me: null,
    vouchers: { selling: false, redeemable: false },
  };
}

// ─── History (SW9) ────────────────────────────────────────────────────────

/** One history row as a sentence: "Checkout switched on by Sam" (ResNeo's own actions name no one). */
export function historyLine(row: PosSwitchHistoryRow): string {
  const name = row.by_resneo || !row.actor_name?.trim() ? 'ResNeo' : row.actor_name.trim();
  return swT(`sw.history.${row.action}`, { feature: switchName(row.feature), name });
}

/** "11 October at 10:04". */
export function historyWhen(row: PosSwitchHistoryRow, timeZone: string, now?: Date): string {
  const date = switchDay(row.created_at, timeZone, now);
  const time = switchTime(row.created_at, timeZone);
  return date && time ? swT('sw.history.when', { date, time }) : date;
}

/** "Switched on by Sam Taylor on 11 October." under "Checkout is on", or null when unknown. */
export function sinceLine(res: PosFeatureSwitchesResponse | null | undefined, timeZone: string, now?: Date): string | null {
  const pos = res?.switches?.pos_enabled;
  const name = pos?.set_by_name?.trim();
  const date = switchDay(pos?.set_at, timeZone, now);
  if (!name || !date) return null;
  return swT('sw.panel.since', { name, date });
}

// ─── The door: the Today card (step 1, section 12) ───

/**
 * Whether this admin is shown the door to Checkout: the Today card. One rule with the web
 * (`feature_offers.pos_door`, `src/lib/pos/switches/door.ts`): offered, the venue
 * has never made a sale, and this admin has not hidden the card. A server dismissal
 * (`dismissed_prompts`) and a "Hide this" on this phone, before the venue is read again, also shut
 * it. An older server sends no door: none shows.
 */
export function offerDoorOpen(input: {
  isAdmin: boolean;
  posEnabled: boolean;
  offer: PosSwitchOffer;
  /** `feature_offers.pos_door`. */
  door: boolean;
  /** `dismissed_prompts` holds `pos_offer`. */
  dismissed: boolean;
  /** "Hide this" pressed on this phone since the venue was read. */
  hiddenHere: boolean;
}): boolean {
  return (
    input.isAdmin &&
    !input.posEnabled &&
    input.offer.state === 'available' &&
    input.door &&
    !input.dismissed &&
    !input.hiddenHere
  );
}

// ─── The Checkout switch in Booking settings (the web's CheckoutSwitchSection) ───

export interface BookingSettingsSwitch {
  /** Checkout is on (the switches' word, not the venue's). */
  on: boolean;
  /** The switch can be moved: off needs nothing, on needs the offer. */
  canToggle: boolean;
  /** The amber line: why it cannot come on, or that ResNeo manages it. */
  note: string | null;
  /** The plan needs attention: the note carries a link to Plan & payments. */
  billingLink: boolean;
}

/**
 * What the Checkout card in Booking settings shows, or null for a venue ResNeo has not offered
 * Checkout to (gate G0: nothing changes for it). The same rules as the web's
 * `CheckoutSwitchSection`: switching off is always allowed (the sheet says what must be finished
 * first); switching on needs the offer; a Checkout ResNeo switched on without offering it is read,
 * with no switch.
 */
export function bookingSettingsSwitch(
  res: PosFeatureSwitchesResponse | null | undefined,
  venueName: string,
): BookingSettingsSwitch | null {
  const pos = res?.switches?.pos_enabled;
  if (!res || !pos) return null;
  const on = pos.effective;
  if (!pos.offered && !on) return null;
  const canToggle = pos.offered && (on || pos.can_switch_on);
  let note: string | null = null;
  if (!on && !pos.can_switch_on) {
    if (res.environment_off) note = swT('sw.na.env');
    else if (pos.platform_state === 'blocked' || pos.unavailable_reason === 'blocked') note = pausedSentence(venueName, pos.public_reason);
    else note = extraReasonSentence(pos.unavailable_reason, venueName) ?? swT('sw.na.other', { venue: venueName });
  } else if (on && !pos.offered) {
    note = swT('sw.bs.managed', { venue: venueName });
  }
  return { on, canToggle, note, billingLink: !on && !pos.can_switch_on && pos.unavailable_reason === 'billing' && !res.environment_off && pos.platform_state !== 'blocked' };
}
