import type { PosBootstrap, PosCapability } from '@/types/pos';
import type { VenueBootstrap } from '@/types/venue';

/**
 * The POS switch (Docs/pos-retail-plan.md §4.20, §4.22 "Venues without POS in the app"; UX spec
 * §13.11). Only `feature_flags.resolved.pos_enabled === true` from GET /api/venue turns Checkout
 * on. Anything else (off, missing, an older web deploy, the venue not loaded yet) is off, and with
 * it off the app makes no `/api/venue/pos` request and shows no POS screen, tile, button or tab:
 * every install behaves exactly as the builds before app step 1.
 *
 * Pure so the gate can be tested without rendering; `usePosEnabled` in `lib/queries/usePos.ts`
 * reads it from the venue bootstrap.
 */
export function isPosEnabled(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): boolean {
  return venue?.feature_flags?.resolved?.pos_enabled === true;
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
