import type { SymbolViewProps } from 'expo-symbols';

import type { SettingsCopyId } from '@/lib/pos/settings-copy';

/**
 * The rows of the app's Checkout settings hub (`app/(app)/checkout-settings/index.tsx`), one per
 * card of the web's Settings, Checkout tab (`CheckoutSettingsSection.tsx`), in the web's order, each
 * gated exactly as the web shows its card. Each row opens its own screen at
 * `/checkout-settings/<slug>`.
 *
 * Pure, so the gates can be tested without rendering. Some rows are built by another screen set
 * (card readers, cards on file, gift vouchers, loyalty, commission, stock, online shop); their
 * routes live beside these.
 */

export type CheckoutSettingsSlug =
  | 'features'
  | 'business'
  | 'receipts'
  | 'tips'
  | 'discounts'
  | 'payment-types'
  | 'cards-on-file'
  | 'gift-vouchers'
  | 'loyalty'
  | 'commission'
  | 'permissions'
  | 'tills'
  | 'card-readers'
  | 'cash'
  | 'stock'
  | 'shop';

/** What the gates read: the settings GET's `can` and map, and the venue's feature switches. */
export interface CheckoutSettingsGateInput {
  can: { is_admin: boolean; manage_settings: boolean; edit_capabilities: boolean };
  /** The venue's staff capability map (the settings GET's `staff_capability_map`). */
  staffCapabilityMap: Record<string, boolean | undefined> | null | undefined;
  trackStockEnabled: boolean;
  /** The venue's resolved `pos_gift_vouchers_enabled`. */
  vouchersEnabled: boolean;
  /** The venue's resolved `pos_loyalty_enabled`. */
  loyaltyEnabled: boolean;
  /** The venue's resolved `pos_online_shop_enabled`. */
  shopEnabled: boolean;
}

export interface CheckoutSettingsSection {
  slug: CheckoutSettingsSlug;
  /** The row's title: the web card's title. */
  title: SettingsCopyId;
  /** A short line under the title. */
  hint: SettingsCopyId;
  icon: SymbolViewProps['name'];
  /** Shown only when this answers true, as the web shows its card. */
  visible: (input: CheckoutSettingsGateInput) => boolean;
}

const always = () => true;
const admin = (i: CheckoutSettingsGateInput) => i.can.is_admin;

export const CHECKOUT_SETTINGS_SECTIONS: readonly CheckoutSettingsSection[] = [
  {
    slug: 'features',
    title: 'feat.title',
    hint: 'app.set.row.features',
    icon: { ios: 'switch.2', android: 'toggle_on', web: 'toggle_on' },
    visible: always,
  },
  {
    slug: 'business',
    title: 'set.biz.title',
    hint: 'app.set.row.business',
    icon: { ios: 'building.2', android: 'business', web: 'business' },
    visible: always,
  },
  {
    slug: 'receipts',
    title: 'set.rcpt.title',
    hint: 'app.set.row.receipts',
    icon: { ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' },
    visible: always,
  },
  {
    slug: 'tips',
    title: 'set.tips.title',
    hint: 'app.set.row.tips',
    icon: { ios: 'heart', android: 'volunteer_activism', web: 'volunteer_activism' },
    visible: always,
  },
  {
    slug: 'discounts',
    title: 'set.disc.title',
    hint: 'app.set.row.discounts',
    icon: { ios: 'tag', android: 'sell', web: 'sell' },
    visible: always,
  },
  {
    slug: 'payment-types',
    title: 'set.ptypes.title',
    hint: 'app.set.row.paymentTypes',
    icon: { ios: 'banknote', android: 'payments', web: 'payments' },
    visible: always,
  },
  {
    slug: 'cards-on-file',
    title: 'app.set.title.cardsOnFile',
    hint: 'app.set.row.cardsOnFile',
    icon: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
    visible: always,
  },
  {
    // Pass V (§20.9): admins, while gift vouchers are switched on for the venue.
    slug: 'gift-vouchers',
    title: 'app.set.title.vouchers',
    hint: 'app.set.row.vouchers',
    icon: { ios: 'gift', android: 'redeem', web: 'redeem' },
    visible: (i) => i.vouchersEnabled && i.can.is_admin,
  },
  {
    // Pass LC (§21.1): admins, while the loyalty switch is on.
    slug: 'loyalty',
    title: 'app.set.title.loyalty',
    hint: 'app.set.row.loyalty',
    icon: { ios: 'star', android: 'loyalty', web: 'loyalty' },
    visible: (i) => i.loyaltyEnabled && i.can.is_admin,
  },
  {
    slug: 'commission',
    title: 'app.set.title.commission',
    hint: 'app.set.row.commission',
    icon: { ios: 'percent', android: 'percent', web: 'percent' },
    visible: admin,
  },
  {
    // Admins only (plan §4.19, PQ34).
    slug: 'permissions',
    title: 'set.caps.presets.title',
    hint: 'app.set.row.permissions',
    icon: { ios: 'person.badge.key', android: 'admin_panel_settings', web: 'admin_panel_settings' },
    visible: (i) => i.can.edit_capabilities,
  },
  {
    slug: 'tills',
    title: 'set.tills.title',
    hint: 'app.set.row.tills',
    icon: { ios: 'tray', android: 'point_of_sale', web: 'point_of_sale' },
    visible: always,
  },
  {
    // Admins, and staff with manage_readers (UX spec §2.3).
    slug: 'card-readers',
    title: 'app.set.title.readers',
    hint: 'app.set.row.readers',
    icon: { ios: 'wave.3.right', android: 'contactless', web: 'contactless' },
    visible: (i) => i.can.is_admin || i.staffCapabilityMap?.manage_readers === true,
  },
  {
    slug: 'cash',
    title: 'set.cash.title',
    hint: 'app.set.row.cash',
    icon: { ios: 'sterlingsign.circle', android: 'account_balance_wallet', web: 'account_balance_wallet' },
    visible: always,
  },
  {
    // Pass 4 (§9.11): only with Track stock on (§9.16).
    slug: 'stock',
    title: 'app.set.title.stock',
    hint: 'app.set.row.stock',
    icon: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
    visible: (i) => i.trackStockEnabled,
  },
  {
    // Pass 6a (§9.12): admins, while the online shop switch is on.
    slug: 'shop',
    title: 'app.set.title.shop',
    hint: 'app.set.row.shop',
    icon: { ios: 'bag', android: 'storefront', web: 'storefront' },
    visible: (i) => i.shopEnabled && i.can.is_admin,
  },
];

/** The rows this login sees, in the web's order. */
export function visibleCheckoutSettingsSections(input: CheckoutSettingsGateInput): CheckoutSettingsSection[] {
  return CHECKOUT_SETTINGS_SECTIONS.filter((s) => s.visible(input));
}

/** The route a row opens. */
export function checkoutSettingsHref(slug: CheckoutSettingsSlug): string {
  return `/checkout-settings/${slug}`;
}

/**
 * Whether this login may open Checkout settings at all: the web shows the Checkout tab to admins,
 * and to team members with `manage_settings` (`src/app/dashboard/settings/page.tsx`).
 */
export function canOpenCheckoutSettings(can: { is_admin: boolean; manage_settings: boolean } | null | undefined): boolean {
  return Boolean(can && (can.is_admin || can.manage_settings));
}
