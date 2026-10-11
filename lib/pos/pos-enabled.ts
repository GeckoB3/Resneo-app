import type { PosBootstrap, PosCapability } from '@/types/pos';
import type { DismissiblePromptKey, PosSwitchOffer, PosSwitchOfferState, PosSwitchUnavailableReason } from '@/types/pos-switches';
import type { VenueBootstrap } from '@/types/venue';

/**
 * The POS switch (Docs/pos-retail-plan.md §4.20, §4.22 "Venues without POS in the app"; UX spec
 * §13.11). Only `feature_flags.resolved.pos_enabled === true` from GET /api/venue turns Checkout
 * on. Anything else (off, missing, an older web deploy, the venue not loaded yet) is off, and with
 * it off the app makes no `/api/venue/pos` request and shows no POS screen, tile, button or tab:
 * every install behaves exactly as the builds before app step 1. The exceptions are the offer
 * below (from GET /api/venue itself) and, at a venue that has had Checkout, the way back to what
 * is left to finish (`posFinishingOpen`).
 *
 * Pure so the gate can be tested without rendering; `usePosEnabled` in `lib/queries/usePos.ts`
 * reads it from the venue bootstrap.
 */
export function isPosEnabled(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): boolean {
  return venue?.feature_flags?.resolved?.pos_enabled === true;
}

const OFFER_STATES: readonly PosSwitchOfferState[] = ['available', 'on', 'paused', 'not_available'];
const OFFER_REASONS: readonly PosSwitchUnavailableReason[] = [
  'not_offered',
  'blocked',
  'environment',
  'plan',
  'currency',
  'billing',
  'onboarding',
  'needs_checkout',
];
const NOT_AVAILABLE: PosSwitchOffer = { state: 'not_available', reason: null, public_reason: null };

/**
 * Checkout's offer to this admin (POS Part 5, SW1 and SW2): `GET /api/venue` `feature_offers.pos`.
 * `available` puts the Checkout tile with "New" in More and the offer card on Today; `paused`
 * keeps the tile to say why. The server sends it to admins only and it is additive, so an older
 * deploy, a team member or anything unreadable is `not_available`: nothing new shows.
 */
export function posOffer(venue: Pick<VenueBootstrap, 'feature_offers'> | null | undefined): PosSwitchOffer {
  const raw: unknown = venue?.feature_offers?.pos;
  if (!raw || typeof raw !== 'object') return NOT_AVAILABLE;
  const { state, reason, public_reason } = raw as Record<string, unknown>;
  if (typeof state !== 'string' || !(OFFER_STATES as readonly string[]).includes(state)) return NOT_AVAILABLE;
  return {
    state: state as PosSwitchOfferState,
    reason: typeof reason === 'string' && (OFFER_REASONS as readonly string[]).includes(reason) ? (reason as PosSwitchUnavailableReason) : null,
    public_reason: typeof public_reason === 'string' && public_reason.trim() ? public_reason.trim() : null,
  };
}

/**
 * The door to Checkout for this admin (POS Part 5, section 12): `feature_offers.pos_door`, the web's
 * one rule for its "New" item and Home card (offered, the venue never made a sale, and this admin
 * has not hidden the card). Only an explicit `true` opens it: an older server, which sends no door,
 * and a team member show none.
 */
export function posOfferDoor(venue: Pick<VenueBootstrap, 'feature_offers'> | null | undefined): boolean {
  return venue?.feature_offers?.pos_door === true;
}

/** Whether this admin hid a prompt, by the server's record (`dismissed_prompts`; absent reads as no). */
export function posPromptDismissed(
  venue: Pick<VenueBootstrap, 'dismissed_prompts'> | null | undefined,
  key: DismissiblePromptKey,
): boolean {
  const list: unknown = venue?.dismissed_prompts;
  return Array.isArray(list) && list.includes(key);
}

/**
 * Checkout is off, but this venue has had it (design section 7.2, "keep the way back"): the routes
 * that finish what was started stay open on the server (`allowWhenOff`: sale reads and lists,
 * refunds, every order action), so the app may offer Sales history and Orders. Read from the
 * stored flag: once Checkout has been switched on, `feature_flags.raw.pos_enabled` holds a boolean
 * (false after switching off or a pause), while a venue that never had Checkout holds nothing, and
 * the app still asks nothing there.
 */
export function posFinishingOpen(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): boolean {
  if (!venue || isPosEnabled(venue)) return false;
  const stored = (venue.feature_flags?.raw as Record<string, unknown> | undefined)?.pos_enabled;
  return typeof stored === 'boolean';
}

/**
 * Gift vouchers (Pass V, UX spec §20): the venue's resolved `pos_gift_vouchers_enabled`, and only
 * with Checkout on. Shows the client profile's "Credit and vouchers" card, as the web's contact
 * panel does. Selling and taking vouchers at a sale follow the POS bootstrap's `vouchers` instead.
 */
export function isVouchersEnabled(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): boolean {
  return isPosEnabled(venue) && venue?.feature_flags?.resolved?.pos_gift_vouchers_enabled === true;
}

/**
 * Loyalty cards (Pass LC, UX spec §21): the venue's resolved `pos_loyalty_enabled`, and only with
 * Checkout on. Shows "Reward ready" on a sale and the client profile's "Loyalty card"; a server
 * before Pass LC does not send the key, so neither appears and no loyalty route is called.
 */
export function isLoyaltyEnabled(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): boolean {
  return isPosEnabled(venue) && venue?.feature_flags?.resolved?.pos_loyalty_enabled === true;
}

/**
 * The online shop (Pass 6a, UX spec §2.1): the venue's resolved `pos_online_shop_enabled`, and only
 * with Checkout on. With it on, logins with `manage_orders` get Orders in More; with it off, Orders
 * stays while paid orders are still waiting, so they can be fulfilled (plan §4.20).
 */
export function isShopEnabled(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): boolean {
  return isPosEnabled(venue) && venue?.feature_flags?.resolved?.pos_online_shop_enabled === true;
}

/**
 * The venue's Track stock switch (simple mode, plan §4.37), from the POS bootstrap. The stock
 * screens (levels, adjustments, history, stocktakes) and the stock fields of the product editor
 * exist only while it is on, as on the web; a server before Pass 4 does not send it, which reads
 * as off.
 */
export function isTrackStockOn(bootstrap: Pick<PosBootstrap, 'settings'> | null | undefined): boolean {
  return bootstrap?.settings?.track_stock_enabled === true;
}

/**
 * Whether this login may do something at the till (plan §4.19). Every POS action is hidden when
 * the capability map does not allow it, as on the web; the server refuses anyway (403
 * POS_PERMISSION_DENIED). Admins are sent every key as true. A key the server leaves out reads as
 * not allowed, and before the bootstrap loads nothing is allowed.
 */
export function canPos(bootstrap: Pick<PosBootstrap, 'capabilities'> | null | undefined, capability: PosCapability): boolean {
  return bootstrap?.capabilities?.[capability] === true;
}

/**
 * Card in the app (`card_app`, plan §4.4.3): the venue's Stripe account can take charges and card
 * payments in person are on (the bootstrap's `card_methods.card_app`), this build has the Terminal
 * SDK and a publishable key (what `TerminalProvider` needs to mount), and the login may take
 * payments.
 */
export function cardAppAvailable(input: {
  bootstrap: Pick<PosBootstrap, 'card_methods' | 'capabilities'> | null | undefined;
  terminalAvailable: boolean;
  publishableKey: boolean;
}): boolean {
  return (
    input.bootstrap?.card_methods?.card_app === true &&
    canPos(input.bootstrap, 'take_payment') &&
    input.terminalAvailable &&
    input.publishableKey
  );
}

/**
 * Whether the booking detail offers "Check out" (UX spec §13.3 `bk.checkout`) in place of "Take
 * payment": only at a POS venue, on a booking this venue may edit (a partner's linked booking is
 * checked out at the partner, `bk.linked.note`), and not on a cancelled booking. With the switch
 * off the booking detail keeps today's "Take payment" and `/charge`.
 */
export function showPosCheckout(input: {
  venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined;
  canEdit: boolean;
  linked: boolean;
  status: string | null | undefined;
}): boolean {
  return isPosEnabled(input.venue) && input.canEdit && !input.linked && input.status !== 'Cancelled';
}
