import { formatPence } from '@/lib/format';

import { fillText, type CopyVars } from './copy';

/**
 * The Online shop settings screen's words, word for word from the web's `src/lib/shop/copy.ts`
 * (`set.shop.*`, `area.*`, `ready.*`, `shop.freeOver`, `sco.rate.defaultEstimate`,
 * `err.SHOP_LEGAL_DETAILS_MISSING`), the strings the web's `ShopSettingsCard` shows.
 *
 * No em-dash anywhere; straight apostrophes; money arrives already formatted.
 */
export const SHOP_SET_COPY = {
  'feature.name': 'Online shop',
  'err.SHOP_LEGAL_DETAILS_MISSING': 'Add these before you open your shop: {missing}.',

  'set.shop.title': 'Online shop',
  'set.shop.status.open': 'Your shop is open.',
  'set.shop.status.closed': 'Your shop is closed.',
  'set.shop.check.legal':
    'Business details complete, including a phone number and, for a limited company, your registered office',
  'set.shop.check.policies': 'Returns, cancellation, delivery and terms of sale written',
  'set.shop.check.cards': 'Card payments set up',
  'set.shop.check.plan': 'Your plan includes online booking',
  'set.shop.check.products': 'At least one product set to sell online',
  'set.shop.check.fulfilment': 'Collection switched on, or at least one delivery zone',
  'set.shop.check.fix': 'Fix this',
  'set.shop.check.done': '(done)',
  'set.shop.check.todo': '(to do)',
  'set.shop.open': 'Open my shop',
  'set.shop.close.title': 'Close your shop?',
  'set.shop.close.body': "Customers can't place new orders. Orders already placed carry on as normal.",
  'set.shop.close.confirm': 'Close shop',
  'set.shop.view': 'View your shop',
  'set.shop.copyLink': 'Copy shop link',
  'set.shop.copied': 'Shop link copied.',
  'set.shop.qr': 'Download QR code',
  'set.shop.returns': 'Returns policy',
  'set.shop.cancellation': "Your customers' right to cancel",
  'set.shop.delivery': 'Delivery information',
  'set.shop.terms': 'Terms of sale',
  'set.shop.policy.template': 'Use our template',
  'set.shop.policy.help':
    "Our templates are a starting point. They cover the 14-day right to cancel, how to cancel, who pays to send things back, sealed hygiene items and your delivery areas. Read them carefully and change anything that doesn't fit how you work.",
  'set.shop.policy.version': 'Version {version}, last changed {date}. Each order keeps the version its customer agreed to.',
  'set.shop.policy.versionNew': 'Each order keeps the version of these its customer agreed to.',
  'set.shop.returnPostage': 'Who pays to send things back after a change of mind?',
  'set.shop.returnPostage.customer': 'The customer',
  'set.shop.returnPostage.venue': '{venue}',
  'set.shop.returnWindow': 'Customers can ask for a return for (days)',
  'set.shop.returnWindow.help':
    "Counted from when they collect or receive it. They then have 14 days to send it back. The law's 14 days is the least you can offer.",
  'set.shop.collection': 'Let customers collect from {venue}',
  'set.shop.collection.instructions': 'Collection instructions',
  'set.shop.collection.ready': 'Usually ready within',
  'set.shop.collection.hold': 'Keep orders for (days)',
  'set.shop.delivery.enabled': 'Deliver orders',
  'set.shop.delivery.help':
    "Add a zone for each place you deliver to, each with its own price. If an address is in a postcode zone and the whole-UK zone, the postcode zone's price is used.",
  'set.shop.rate.add': 'Add a delivery zone',
  'set.shop.rate.starter': 'Add a zone for the whole of {country}',
  'set.shop.rate.edit': 'Edit',
  'set.shop.rate.name': 'Name customers see',
  'set.shop.rate.name.placeholder': 'Standard delivery',
  'set.shop.rate.area': 'Where it delivers',
  'set.shop.rate.kind.uk': 'The whole UK',
  'set.shop.rate.kind.ie': 'Republic of Ireland',
  'set.shop.rate.kind.local': 'Local delivery (postcodes you choose)',
  'set.shop.rate.kind.highlands': 'Highlands and islands',
  'set.shop.rate.name.local': 'Local delivery',
  'set.shop.rate.name.highlands': 'Highlands and islands',
  'set.shop.rate.name.ie': 'Republic of Ireland',
  'set.shop.rate.postcodes': 'Postcodes it covers',
  'set.shop.rate.postcodes.help':
    'Use the first part of a postcode, separated by commas: a whole area (LS), a district (LS6), a sector (LS6 2) or a range (LS1-LS9).',
  'set.shop.rate.postcodes.missing': 'Add at least one postcode area or district.',
  'set.shop.rate.highlands.note': "These are the postcodes most carriers charge extra for. Check your carrier's list and change it if you need to.",
  'set.shop.rate.ie.note':
    'Parcels to the Republic of Ireland need a customs form, and your customer may have to pay import VAT or fees when it arrives. Check with your carrier and your accountant before you offer it.',
  'set.shop.rate.price': 'Price',
  'set.shop.rate.freeOver': 'Free when the order is over (optional)',
  'set.shop.rate.estimate': 'Delivery time',
  'set.shop.rate.estimate.placeholder': '2 to 3 working days',
  'set.shop.rate.active': 'Offer this zone',
  'set.shop.rate.save': 'Save zone',
  'set.shop.rate.none': 'No delivery zones yet.',
  'set.shop.rate.inactive': 'Not offered',
  'set.shop.rate.missing': 'Add a name and a price.',
  'set.shop.stock': 'Show stock in your shop',
  'set.shop.stock.exact': 'Show how many are left',
  'set.shop.stock.low_only': 'Only say when stock is low',
  'set.shop.stock.none': "Don't show stock",
  'set.shop.minOrder': 'Minimum order (optional)',
  'set.shop.deliveryOnly.note':
    'With collection off, delivery is the only way to get your products, so your shop shows prices with delivery included.',
  'set.shop.messages': 'Messages to customers',
  'set.shop.messages.always':
    'Order confirmations, ready to collect, dispatched, refund and cancellation emails always go, because they carry the order and the law.',
  'set.shop.readySms': 'Also text customers when their order is ready to collect',
  'set.shop.deliveredEmail': 'Email customers when you mark an order delivered',
  'set.shop.saved': 'Shop settings saved.',

  'shop.freeOver': 'Free delivery on orders over {threshold}. Below that, delivery costs {amount}.',
  'sco.rate.defaultEstimate': 'Delivered within 30 days',

  'area.uk': 'The whole UK',
  'area.ie': 'Republic of Ireland',
  'area.postcodes': 'Postcodes {list}',
  'area.postcodesMore': 'Postcodes {list} and {count} more',
  'areas.uk': 'the UK',
  'ready.60': '1 working hour',
  'ready.120': '2 working hours',
  'ready.240': '4 working hours',
  'ready.480': '1 working day',
  'ready.960': '2 working days',
} as const;

export type ShopSetCopyId = keyof typeof SHOP_SET_COPY;

export function shT(id: ShopSetCopyId, vars: CopyVars = {}): string {
  return fillText(SHOP_SET_COPY[id], vars);
}

/** The "Usually ready within" choices, in the web's order. */
export const READY_OPTIONS = [60, 120, 240, 480, 960] as const;

/** What a zone covers, as the web's zone row says it: "The whole UK", "Postcodes LS6, LS7 and 3 more". */
export function zoneAreaText(zone: { area: string; include_postcode_prefixes?: string[] }): string {
  if (zone.area === 'ie') return shT('area.ie');
  if (zone.area !== 'postcodes') return shT('area.uk');
  const list = zone.include_postcode_prefixes ?? [];
  return list.length > 4
    ? shT('area.postcodesMore', { list: list.slice(0, 4).join(', '), count: list.length - 4 })
    : shT('area.postcodes', { list: list.join(', ') });
}

/** The four kinds the zone editor offers (web `ZoneKind`); local and Highlands are both postcode zones. */
export type ZoneKind = 'uk' | 'ie' | 'local' | 'highlands';

/** Which kind an existing zone is: a postcode zone is the Highlands one while its list is unchanged. */
export function zoneKind(zone: { area: string; include_postcode_prefixes?: string[] }, highlands: readonly string[]): ZoneKind {
  if (zone.area === 'ie') return 'ie';
  if (zone.area !== 'postcodes') return 'uk';
  const list = zone.include_postcode_prefixes ?? [];
  const same = list.length === highlands.length && list.every((p, i) => p === highlands[i]);
  return same ? 'highlands' : 'local';
}

/** The name a new zone of this kind starts with ('' for the whole UK). */
export function zoneKindName(kind: ZoneKind): string {
  if (kind === 'local') return shT('set.shop.rate.name.local');
  if (kind === 'highlands') return shT('set.shop.rate.name.highlands');
  if (kind === 'ie') return shT('set.shop.rate.name.ie');
  return '';
}

/** What the venue typed, one entry per postcode prefix ("LS6, LS7" becomes ["LS6", "LS7"]). */
export function postcodeEntries(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Money in the venue's currency (web `formatMoney(p, currency)`). */
export function shopMoney(pence: number, currency: string | null | undefined): string {
  if (currency) {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
    } catch {
      // An unknown code falls back to the app's own formatter.
    }
  }
  return formatPence(pence) ?? `£${(pence / 100).toFixed(2)}`;
}

/** One zone's line under its name: area, price, free over, delivery time (web zone row). */
export function zoneSummary(
  zone: { area: string; include_postcode_prefixes?: string[]; price_pence: number; free_over_pence: number | null; estimate_text: string | null },
  currency: string | null | undefined,
): string {
  const money = (p: number) => shopMoney(p, currency);
  const parts = [zoneAreaText(zone), money(zone.price_pence)];
  if (zone.free_over_pence != null) {
    parts.push(shT('shop.freeOver', { threshold: money(zone.free_over_pence), amount: money(zone.price_pence) }));
  }
  parts.push(zone.estimate_text ?? shT('sco.rate.defaultEstimate'));
  return parts.join(' · ');
}
