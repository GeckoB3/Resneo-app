/**
 * Venues switch Checkout and its extras on themselves (POS test round 2026-10-11, Part 5, owner
 * decisions SW1 to SW10). The venue half of the web's shared contract, mirrored word for word from
 * `src/lib/pos/switches/types.ts` (the platform console's types are left out: the app never shows
 * them). Change it only together with the web.
 *
 * What the app reads:
 * - `GET /api/venue` `feature_offers.pos` (admins; additive, so an older server sends nothing, which
 *   reads as `not_available`): the More tile with "New", the Today card and the landing's state.
 * - `GET` and `POST /api/venue/feature-switches` over Bearer (admins only): the landing, the
 *   "Checkout is on" group in Checkout settings and both sheets.
 * - `GET /api/venue/feature-switches/vouchers.csv`: the list of vouchers with money left.
 * - `POST /api/venue/prompts/dismiss` with `{ key: 'pos_offer' }`: "Hide this" on the Today card.
 */

/** The four switches, by their `venues.feature_flags` key. Checkout first. */
export const POS_SWITCH_KEYS = [
  'pos_enabled',
  'pos_gift_vouchers_enabled',
  'pos_loyalty_enabled',
  'pos_online_shop_enabled',
] as const;

export type PosSwitchKey = (typeof POS_SWITCH_KEYS)[number];
export type PosSwitchExtraKey = Exclude<PosSwitchKey, 'pos_enabled'>;

/** The three extras, in the order the landing and Checkout settings list them. */
export const POS_SWITCH_EXTRA_KEYS: readonly PosSwitchExtraKey[] = [
  'pos_gift_vouchers_enabled',
  'pos_loyalty_enabled',
  'pos_online_shop_enabled',
];

export function isPosSwitchKey(value: unknown): value is PosSwitchKey {
  return typeof value === 'string' && (POS_SWITCH_KEYS as readonly string[]).includes(value);
}

/** ResNeo's per-venue control (`venue_feature_switches.platform_state`). */
export type PosSwitchPlatformState = 'none' | 'invited' | 'blocked';

/**
 * The seller acknowledgement accepted at a venue's first switch-on (SW8). The app sends the
 * version the server's GET names (`terms_version`), which is this one.
 */
export const POS_SELLER_TERMS_VERSION = '2026-10-11';

/** Why a venue cannot switch a feature ON. Null when it can. */
export type PosSwitchUnavailableReason =
  /** The dial is `off`, or `invited` and this venue is not invited. */
  | 'not_offered'
  /** ResNeo blocked this switch for the venue (`platform_state = 'blocked'`); see `public_reason`. */
  | 'blocked'
  /** The environment emergency switch forces it off for everyone. */
  | 'environment'
  /** The venue's plan does not include it (only an appointments plan can have Checkout). */
  | 'plan'
  /** Checkout works in pounds only (D12). */
  | 'currency'
  /** The subscription has lapsed (past due or expired). */
  | 'billing'
  /** The venue has not finished onboarding. */
  | 'onboarding'
  /** An extra, while Checkout itself cannot be switched on (the reason is on `pos_enabled`). */
  | 'needs_checkout';

/** One switch as an admin sees it. */
export interface PosSwitchView {
  key: PosSwitchKey;
  /** What the venue gets now (the materialised `venues.feature_flags` value, environment applied). */
  effective: boolean;
  /** What the venue's admins chose. Kept while blocked, so unblocking restores it. */
  venue_choice: boolean;
  platform_state: PosSwitchPlatformState;
  /** The sentence the venue reads while blocked, or null. Never the internal reason. */
  public_reason: string | null;
  /** The dial offers this switch to this venue (`all`, or `invited` and invited). */
  offered: boolean;
  /** An admin could switch it on now (it is off and every check passes). */
  can_switch_on: boolean;
  unavailable_reason: PosSwitchUnavailableReason | null;
  /** When and by whom the venue's choice was last set (a staff name, or "ResNeo"). */
  set_at: string | null;
  set_by_name: string | null;
  /** Optimistic concurrency for POST: send the version of the row you are changing. */
  version: number;
}

/** Something that refuses switching Checkout off: money is moving (SW5). */
export interface PosSwitchBlockingItem {
  kind: 'card_payment_in_progress' | 'sale_waiting_on_phone';
  sale_id: string;
  /** The venue's sale number, for "Sale 12". */
  sale_number: number | null;
}

/** What is still in use when Checkout (or an extra) goes off: warnings with counts (SW5). */
export interface PosSwitchInUse {
  /** Refusals. Non-empty means POST with `on: false` answers 409 `SWITCH_IN_USE`. */
  blocking: PosSwitchBlockingItem[];
  till_open: boolean;
  open_sales: number;
  part_paid_sales: number;
  unpaid_pay_links: number;
  /** The latest expiry among the unpaid pay links, for "until {date}". */
  pay_links_last_expires_at: string | null;
  unfinished_orders: number;
  /** Gift vouchers and account credit with money left: switching off needs the acknowledgement. */
  stored_value_count: number;
  stored_value_outstanding_pence: number;
  rewards_waiting: number;
}

export type PosSwitchHistoryAction = 'on' | 'off' | 'block' | 'unblock' | 'invite' | 'uninvite' | 'repair' | 'backfill';
export type PosSwitchHistoryLayer = 'venue' | 'platform' | 'system';

/** One row of the History list in Checkout settings (SW9: history only, no email). */
export interface PosSwitchHistoryRow {
  id: string;
  feature: PosSwitchKey;
  action: PosSwitchHistoryAction;
  layer: PosSwitchHistoryLayer;
  /** "Sam", or null for the system. */
  actor_name: string | null;
  /** True when ResNeo acted (a superuser, or a support session). */
  by_resneo: boolean;
  /** The public reason for a block, if any. Never the internal one. */
  public_reason: string | null;
  created_at: string;
}

/** What the landing says the venue has already, and needs for cards. */
export interface PosSwitchPrerequisites {
  stripe_connected: boolean;
  stripe_charges_enabled: boolean;
  in_person_payments_enabled: boolean;
}

/** `GET /api/venue/feature-switches` (admins only; web session or Bearer). */
export interface PosFeatureSwitchesResponse {
  venue: {
    name: string;
    currency: string;
    /** The collective the venue belongs to, for the landing's collective sentence, or null. */
    collective_name: string | null;
  };
  /** The acknowledgement the first switch-on asks for, and whether this venue accepted it already. */
  terms_version: string;
  terms_accepted: boolean;
  /** The environment emergency switch is set for Checkout: nobody can switch on. */
  environment_off: boolean;
  switches: Record<PosSwitchKey, PosSwitchView>;
  prerequisites: PosSwitchPrerequisites;
  /** Counts for the off sheet. Zeros when Checkout is off. */
  in_use: PosSwitchInUse;
  /** The last ten history rows, newest first. */
  history: PosSwitchHistoryRow[];
}

/** `POST /api/venue/feature-switches` (admins only; web session or Bearer). */
export interface PosFeatureSwitchRequest {
  feature: PosSwitchKey;
  on: boolean;
  /** An extra chosen while Checkout is off: switch Checkout on in the same call (SW4). */
  also_checkout?: boolean;
  /** Required at the venue's first switch-on of Checkout: `POS_SELLER_TERMS_VERSION`. */
  acknowledge_terms_version?: string;
  /** Switching Checkout or gift vouchers off with money left on vouchers or credit (SW5). */
  acknowledge?: 'stored_value_outstanding'[];
  /** Idempotency: a replay returns the first result. */
  client_request_id: string;
  /** `switches[feature].version` as last read. */
  version: number;
}

/** 200 from POST: the state after the change. */
export interface PosFeatureSwitchResult {
  ok: true;
  switches: PosFeatureSwitchesResponse;
}

/**
 * Error codes from POST (bodies carry `{ error, code, ... }`):
 * - 403 `not_admin`;
 * - 409 `SWITCH_NOT_AVAILABLE` with `reason: PosSwitchUnavailableReason` (and `public_reason` when blocked);
 * - 409 `SWITCH_IN_USE` with `blocking: PosSwitchBlockingItem[]`;
 * - 409 `SWITCH_NEEDS_ACKNOWLEDGEMENT` with `needs: Array<'terms' | 'stored_value_outstanding'>`;
 * - 412 `SWITCH_STALE` with the fresh `switches`.
 */
export type PosFeatureSwitchErrorCode =
  | 'not_admin'
  | 'SWITCH_NOT_AVAILABLE'
  | 'SWITCH_IN_USE'
  | 'SWITCH_NEEDS_ACKNOWLEDGEMENT'
  | 'SWITCH_STALE';

/**
 * The offer an admin sees on the More tab and Today, sent as `GET /api/venue` `feature_offers.pos`.
 * - `available`: Checkout is off and this admin's venue can switch it on now ("New").
 * - `on`: Checkout is on.
 * - `paused`: ResNeo blocked it, or the environment switch is set.
 * - `not_available`: not offered, or not eligible (plan, pounds, billing, onboarding); nothing shows.
 */
export type PosSwitchOfferState = 'available' | 'on' | 'paused' | 'not_available';

export interface PosSwitchOffer {
  state: PosSwitchOfferState;
  reason: PosSwitchUnavailableReason | null;
  /** The public reason while paused by ResNeo. */
  public_reason: string | null;
}

/**
 * `GET /api/venue` additions for admins (Part 5 §10; additive, so an older server sends neither and
 * the app reads that as `not_available` and no door): `feature_offers` and `dismissed_prompts`.
 */
export interface VenueFeatureOffers {
  pos: PosSwitchOffer;
  /**
   * Show the "New" badge or item and the offer card: offered, the venue never made a sale, and this
   * admin has not hidden it (the web's `door.ts`, the rule its menu and Home card use too).
   */
  pos_door: boolean;
}

/** Server-side dismissals kept on the staff row (`staff.dismissed_prompt_keys`). */
export const DISMISSIBLE_PROMPT_KEYS = ['pos_offer', 'pos_setup'] as const;
export type DismissiblePromptKey = (typeof DISMISSIBLE_PROMPT_KEYS)[number];
