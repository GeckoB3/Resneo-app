import { isPosEnabled, isShopEnabled, isVouchersEnabled } from '@/lib/pos/pos-enabled';
import type {
  LaneCommunicationPolicies,
  PosMessageSwitchKey,
  PosMessageSwitches,
  VenueCommunicationPolicies,
} from '@/types/communications';
import type { VenueBootstrap } from '@/types/venue';

/**
 * Checkout messages on the Communications screen (web `PosMessageSwitchesBlock` and
 * `src/lib/communications/pos-message-switches.ts`, plan §4.23): one on/off switch per POS
 * customer message, stored beside the lanes in `communication_policies` as `pos`. A missing key
 * is on, so a venue that never touches a switch keeps sending.
 *
 * Shown only while Checkout is on; the gift voucher reminder only with gift vouchers on; the
 * shop's two optional messages only with the shop on. Those two are the shop's own settings
 * (`shop_delivered_email_enabled`, `shop_ready_sms_enabled`, PATCH /api/venue/shop/settings), so
 * each message has one switch wherever it is changed.
 *
 * The copy is the web's, word for word.
 */

export type PosMessageFeature = 'pos' | 'vouchers';

export const POS_MESSAGE_SWITCHES: readonly {
  key: PosMessageSwitchKey;
  feature: PosMessageFeature;
  label: string;
  description: string;
}[] = [
  {
    key: 'pos_sale_receipt',
    feature: 'pos',
    label: 'Sale receipt',
    description:
      'Emailed automatically after a sale, when Checkout is set to send receipts. Staff can still send one when a client asks.',
  },
  {
    key: 'pos_refund_receipt',
    feature: 'pos',
    label: 'Refund receipt',
    description: 'Sent automatically when a refund goes through, the same way the sale receipt went.',
  },
  {
    key: 'voucher_expiry_reminder',
    feature: 'vouchers',
    label: 'Gift voucher expiry reminder',
    description: 'Emails the holder 30 days before a gift voucher with money left on it runs out.',
  },
];

export type ShopMessageSwitchKey = 'shop_delivered_email_enabled' | 'shop_ready_sms_enabled';

export const SHOP_MESSAGE_SWITCHES: readonly { key: ShopMessageSwitchKey; label: string; description: string }[] = [
  {
    key: 'shop_delivered_email_enabled',
    label: 'Order delivered',
    description: 'Emails the customer when you mark a delivery order as delivered.',
  },
  {
    key: 'shop_ready_sms_enabled',
    label: 'Ready to collect text',
    description: 'Also texts the customer when their order is ready to collect. The email always goes.',
  },
];

export const POS_MESSAGES_COPY = {
  title: 'Checkout messages',
  intro: 'Messages sent to clients after a sale. Switch one off to stop it going automatically.',
  shopTitle: 'Online shop messages',
  shopIntro:
    'Order confirmations, dispatch, refund and cancellation emails always go, because they are the order itself. These two are your choice. They are the same switches as in Checkout, Online shop.',
  shopStale: "Someone else changed the shop settings while you were here. We've loaded their changes. Try again.",
} as const;

export const POS_MESSAGE_SWITCH_KEYS: readonly PosMessageSwitchKey[] = POS_MESSAGE_SWITCHES.map((s) => s.key);

export interface PosMessageFeatures {
  pos: boolean;
  vouchers: boolean;
  shop: boolean;
}

/** The venue's resolved flags, as the web's SettingsView passes them to the block. */
export function posMessageFeatures(venue: Pick<VenueBootstrap, 'feature_flags'> | null | undefined): PosMessageFeatures {
  return { pos: isPosEnabled(venue), vouchers: isVouchersEnabled(venue), shop: isShopEnabled(venue) };
}

/** The Checkout switches to show: none without Checkout, the voucher reminder only with vouchers. */
export function visiblePosMessageSwitches(features: PosMessageFeatures): typeof POS_MESSAGE_SWITCHES {
  if (!features.pos) return [];
  return POS_MESSAGE_SWITCHES.filter((s) => s.feature === 'pos' || (s.feature === 'vouchers' && features.vouchers));
}

/** Every switch on: what a venue has until it changes one. */
export function defaultPosMessageSwitches(): PosMessageSwitches {
  return Object.fromEntries(POS_MESSAGE_SWITCH_KEYS.map((k) => [k, { enabled: true }])) as PosMessageSwitches;
}

/** The `pos` block, with anything missing or malformed read as on (web `parsePosMessageSwitches`). */
export function parsePosMessageSwitches(raw: unknown): PosMessageSwitches {
  const out = defaultPosMessageSwitches();
  if (!raw || typeof raw !== 'object') return out;
  const row = raw as Record<string, unknown>;
  for (const key of POS_MESSAGE_SWITCH_KEYS) {
    const v = row[key];
    if (v && typeof v === 'object' && (v as { enabled?: unknown }).enabled === false) out[key] = { enabled: false };
  }
  return out;
}

export function samePosMessageSwitches(a: PosMessageSwitches, b: PosMessageSwitches): boolean {
  return POS_MESSAGE_SWITCH_KEYS.every((k) => a[k].enabled === b[k].enabled);
}

/**
 * The PUT body for /api/venue/communication-policies: only the parts that changed. The server
 * merges the patch into the stored map and keeps a `pos` block the patch leaves out, so a
 * lanes-only save never touches the Checkout switches (and a switches-only save leaves the lanes).
 */
export function buildCommunicationPoliciesPatch(input: {
  lane: LaneCommunicationPolicies | null;
  laneChanged: boolean;
  pos: PosMessageSwitches | null;
  posChanged: boolean;
}): VenueCommunicationPolicies | null {
  const patch: VenueCommunicationPolicies = {};
  if (input.laneChanged && input.lane) patch.appointments_other = input.lane;
  if (input.posChanged && input.pos) patch.pos = input.pos;
  return Object.keys(patch).length > 0 ? patch : null;
}
