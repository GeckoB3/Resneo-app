import { fillCopy, type CopyVars } from '@/lib/pos/copy';
import type { PosSwitchExtraKey, PosSwitchKey } from '@/types/pos-switches';

/**
 * The words for switching Checkout on and off in the app (POS test round 2026-10-11, Part 5,
 * `part5-switch-on-recommendation.md` section 14). Keys in the web's `sw.*` form are word for word
 * the web's (`src/components/pos/switches/copy.ts`: the design's deck and the web builder's
 * `SWITCH_COPY_ADDED`), so the two never drift; `app.sw.*` is step 8, the app's own copy, plus the
 * few lines where the web names a place the app does not have (Settings, Checkout and Settings,
 * Plan are More, Checkout settings and Plan & payments here). Lines neither has are marked (app).
 * No emails (SW9: the history is the record).
 *
 * Rules `copy.test.ts` enforces: no em-dash anywhere, straight apostrophes, no currency symbol next
 * to a money placeholder (money arrives formatted). A count of one uses the `<id>.one` wording.
 */
export const SWITCH_COPY = {
  // Step 1: the offer card, on Today in the app (the web's Home card).
  'sw.offer.eyebrow': 'New',
  'sw.offer.see': 'See how it works',
  'sw.offer.hide': 'Hide this',
  'sw.offer.hideFailed': "We couldn't hide this. Please try again.",
  // The web says "in Settings, Checkout"; in the app the Checkout tile stays in More.
  'app.sw.offer.hidden': 'Hidden. You can find Checkout any time in More.',

  // Step 8: the app (C1 and C2).
  'app.sw.tile': 'Checkout',
  'app.sw.tile.badge': 'New',
  'app.sw.title': 'Take payments on your phone and at your desk',
  'app.sw.body':
    'Check clients out in two taps, take cards with Tap to Pay, sell products and send receipts. Included in your plan.',
  'app.sw.switchOn': 'Switch on Checkout',
  'app.sw.adminOnly': 'Ask an admin to switch on Checkout.',

  // Step 2: the landing. Each extra is "Name. What it does." (the web's `extraLanding` splits it).
  'sw.landing.extras.title': 'Add extras if you like',
  'sw.landing.extras.vouchers': 'Gift vouchers. Sell them at your desk and online.',
  'sw.landing.extras.loyalty': 'Loyalty card. Reward clients who keep coming back.',
  'sw.landing.extras.shop': 'Online shop. Sell products for collection or delivery.',
  'sw.landing.extras.help': 'You can add or remove these at any time.',
  'sw.landing.cost.title': 'What it costs',
  'sw.landing.cost.included':
    'Included in your plan. Card payments go straight to your own Stripe account. Stripe charges a small fee on each card payment, and ResNeo takes nothing.',
  'sw.landing.need.title': "What you'll need",
  'sw.landing.need.nothing': 'Nothing to get started. You can take cash straight away.',
  'sw.landing.need.cards':
    'To take cards, connect Stripe and use the ResNeo app on your phone, or a counter card reader.',
  'sw.landing.need.stripeDone': 'Stripe is connected.',
  'sw.landing.small': 'You can switch it off whenever you like. Nothing is deleted.',
  'sw.landing.collective':
    "Checkout is for {venue} only. Each business in {collective} has its own till, products and takings. Your shared booking page has no shop or gift vouchers of its own: it links to each business's own shop and voucher page while they sell online.",

  // Step 2: the states shown instead of the button.
  'sw.na.currency': "Checkout works in pounds for now. We'll let you know when it works in euros.",
  // The web's sw.na.billing names Settings, Plan; in the app the plan is Plan & payments, in More.
  'app.sw.na.billing': 'Your plan needs attention. Once your subscription is sorted in Plan & payments, you can switch on Checkout.',
  'sw.na.paused.title': 'Checkout is paused',
  'sw.na.paused.body':
    'ResNeo has paused Checkout for {venue}: {publicReason} You can still see past sales and give refunds. Contact ResNeo support if you have any questions.',
  'sw.na.paused.bodyNoReason':
    'ResNeo has paused Checkout for {venue}. You can still see past sales and give refunds. Contact ResNeo support if you have any questions.',
  'sw.na.env': 'Checkout is paused for everyone for a short while. Please try again later.',
  'sw.na.other': "Checkout can't be switched on for {venue} right now. Contact ResNeo support if you have any questions.",

  // Step 3: the confirmation, as a sheet.
  'sw.on.title': 'Switch on Checkout for {venue}?',
  'sw.on.changes': "Here's what changes:",
  'sw.on.change.menu': 'Checkout and Products appear in your menu.',
  'sw.on.change.team': 'Your team can check clients out. You choose what else they can do.',
  'sw.on.change.app': 'In the ResNeo app, Take payment becomes Check out. Tap to Pay works the same way.',
  'sw.on.change.clients': 'Your clients see nothing new until you sell gift vouchers online or open your shop.',
  'sw.on.change.loyalty':
    'Clients will see their loyalty card in their ResNeo account and on receipts, and get an email when they earn a reward.',
  'sw.on.alsoCheckout': "Gift vouchers are taken as payment at Checkout, so we'll switch that on too, in its simplest form.",
  'sw.on.alsoCheckout.loyalty': "Loyalty rewards are used at Checkout, so we'll switch that on too, in its simplest form.",
  'sw.on.alsoCheckout.shop':
    "Online shop orders are paid and refunded through Checkout, so we'll switch that on too, in its simplest form.",
  'sw.on.ack':
    "I understand that {venue} is the seller. Payments go to our own Stripe account, and we're responsible for our prices, VAT, tips and refunds.",
  'sw.on.ackNeeded': 'Tick the box to say you understand, then try again.',
  'sw.on.confirm': 'Switch on and set up',
  'sw.on.cancel': 'Not now',
  'sw.on.done': "Checkout is on. Let's get it ready.",
  // The web says "You can try again in Settings, Checkout."; the app says it in Checkout settings.
  'app.sw.on.extrasFailed': "Checkout is on, but we couldn't switch on {extras}. You can try again below.",

  // Step 6: Checkout settings, the group on top while Checkout is on.
  'sw.panel.title': 'Checkout is on',
  'sw.panel.since': 'Switched on by {name} on {date}.',
  'sw.panel.extras': 'Extras',
  'sw.panel.extra.off': 'Off',
  'sw.panel.extra.on': 'On',
  'sw.panel.extra.paused': 'Paused by ResNeo',
  'sw.panel.history': 'History',
  'sw.panel.switchOff': 'Switch off Checkout',
  'sw.history.hide': 'Hide history',
  // (app) Each extra's own settings, under its switch while it is on, and what a switch did.
  // Opens the extra's own settings whether or not it is set up yet, so it does not say "Set up".
  'app.sw.panel.setUp': 'Settings',
  'app.sw.extra.onDone': '{extra} switched on.',
  'app.sw.extra.offDone': '{extra} switched off.',

  // The extras by name.
  'sw.extra.vouchers': 'Gift vouchers',
  'sw.extra.loyalty': 'Loyalty card',
  'sw.extra.shop': 'Online shop',

  // The History list (SW9: every change is shown here instead of being emailed).
  'sw.history.on': '{feature} switched on by {name}',
  'sw.history.off': '{feature} switched off by {name}',
  'sw.history.block': '{feature} paused by ResNeo',
  'sw.history.unblock': '{feature} pause lifted by ResNeo',
  'sw.history.invite': '{feature} offered to you by ResNeo',
  'sw.history.uninvite': '{feature} no longer offered by ResNeo',
  'sw.history.repair': '{feature} setting corrected by ResNeo',
  'sw.history.backfill': '{feature} setting recorded by ResNeo',
  'sw.history.when': '{date} at {time}',
  'sw.history.empty': 'Nothing has changed yet.',

  // Step 7: switching off.
  'sw.off.title': 'Switch off Checkout?',
  'sw.off.body':
    "Nobody will be able to start a new sale. You'll still see past sales and can give refunds. Nothing is deleted, and you can switch it back on whenever you like.",
  'sw.off.blocked.payment': 'A card payment is in progress on sale {saleNo}. Finish or cancel it first.',
  'sw.off.blocked.phone': 'Sale {saleNo} is waiting for a phone to take the card. Cancel it first.',
  'sw.off.blocked.paymentNoNumber': 'A card payment is in progress. Finish or cancel it first.',
  'sw.off.blocked.phoneNoNumber': 'A sale is waiting for a phone to take the card. Cancel it first.',
  'sw.off.warn.till': 'Your till is still open. Close it and count the cash first.',
  'sw.off.warn.open': "{count} sales are still open. They'll be waiting if you switch Checkout back on.",
  'sw.off.warn.open.one': "1 sale is still open. It'll be waiting if you switch Checkout back on.",
  'sw.off.warn.partPaid': '{count} sales are part paid. Take the rest, refund it, or send a pay link first.',
  'sw.off.warn.partPaid.one': '1 sale is part paid. Take the rest, refund it, or send a pay link first.',
  'sw.off.warn.links': "{count} pay links can still be paid until {date}. Cancel them if you don't want that.",
  'sw.off.warn.links.one': "1 pay link can still be paid until {date}. Cancel it if you don't want that.",
  'sw.off.warn.linksNoDate': "{count} pay links can still be paid. Cancel them if you don't want that.",
  // (app) The web's deck has no singular for this one yet.
  'sw.off.warn.linksNoDate.one': "1 pay link can still be paid. Cancel it if you don't want that.",
  'sw.off.warn.orders': '{count} online orders still need handing over or sending. You can still do that from Orders.',
  'sw.off.warn.orders.one': '1 online order still needs handing over or sending. You can still do that from Orders.',
  'sw.off.warn.vouchers': 'Your clients hold {amount} of gift vouchers and credit. You still have to accept them, even with Checkout off.',
  'sw.off.vouchers.download': 'Download the list',
  'sw.off.vouchers.ack': "We'll still honour these gift vouchers.",
  'sw.off.ackNeeded': "Tick the box to say you'll still honour these gift vouchers, then try again.",
  'sw.off.warn.rewards': "{count} clients have a loyalty reward waiting. They're kept for if you switch back on.",
  'sw.off.warn.rewards.one': "1 client has a loyalty reward waiting. It's kept for if you switch back on.",
  'sw.off.pauseInstead': 'Pause the loyalty card instead',
  'sw.off.keep': 'Keep Checkout on',
  'sw.off.confirm': 'Switch off',
  'sw.off.done': 'Checkout is off. Your past sales are in Sales history, in your menu.',
  'sw.off.done.nothingLeft': 'Checkout is off. Nothing is deleted, and you can switch it back on whenever you like.',
  // The links the off sheet's warnings carry (A6 draws "Open the till").
  'sw.off.link.till': 'Open the till',
  'sw.off.link.sales': 'See open sales',
  'sw.off.link.orders': 'Open Orders',
  'sw.off.link.sale': 'Open sale {saleNo}',
  'sw.off.link.saleNoNumber': 'Open the sale',

  // Switching one extra off (design section 7.3).
  'sw.extraOff.vouchers.title': 'Switch off gift vouchers?',
  'sw.extraOff.vouchers.body':
    "You won't be able to sell gift vouchers at your desk, in the app or online. Vouchers you've already sold can still be taken as payment at Checkout. Nothing is deleted.",
  'sw.extraOff.vouchers.online': "Your voucher page will say vouchers aren't on sale.",
  // (app) Switching vouchers off with money left: they stay usable at Checkout, which stays on.
  'app.sw.extraOff.vouchersHeld':
    'Your clients hold {amount} of gift vouchers and credit. They can still use them at Checkout, and you still have to accept them.',
  'sw.extraOff.loyalty.title': 'Switch off the loyalty card?',
  'sw.extraOff.loyalty.body':
    'Clients stop earning stamps, and the card is hidden from them. Nothing is deleted, and switching it back on brings everything back.',
  'sw.extraOff.shop.title': 'Switch off the online shop?',
  'sw.extraOff.shop.body':
    'Your shop closes at once. Orders already placed stay in Orders, so you can still hand them over, send and refund them.',
  'sw.extraOff.shop.break': 'Just need a break? Close your shop in the Online shop settings instead.',
  'sw.extraOff.keep': 'Keep it on',
  // (app) The link under it.
  'app.sw.extraOff.openShopSettings': 'Open Online shop settings',

  // (app) An extra's own settings screen while that extra is off (Settings, Checkout on the web
  // leaves the card out instead): an admin is pointed at the Extras in Checkout settings.
  'app.sw.gate.switchOn': 'You can switch it on in Checkout settings, under Extras.',
  'app.sw.gate.open': 'Open Checkout settings',
  'app.sw.gate.staff': 'An admin can switch it on in Checkout settings.',
  'app.sw.gate.notYet': "It isn't available for your business yet.",
  'app.sw.gate.paused': 'ResNeo has paused it for your business: {publicReason} Contact ResNeo support if you have any questions.',
  'app.sw.gate.pausedNoReason': 'ResNeo has paused it for your business. Contact ResNeo support if you have any questions.',

  // The Checkout switch in Booking settings, "Payments at your venue", under "Card payments in
  // person" (the web's Settings, Booking Settings; owner, 2026-10-22: each card says what it does
  // and how the two fit together, in "Which do I need?" under them).
  'sw.bs.eyebrow': 'Checkout',
  'sw.bs.title': 'Checkout: your till',
  'sw.bs.body':
    "A full point of sale on the web and in the ResNeo app. Check clients out after their appointment, sell products and gift vouchers, take cash, cards and tips, send receipts, cash up at the end of the day and see your takings. It's included in your plan.",
  'sw.bs.cardsOff': 'To take cards at the till, also turn on Card payments in person, above.',
  'sw.bs.which.title': 'Which do I need?',
  'sw.bs.which.cards': 'Just want to take a card or cash for an appointment on your phone? Turn on Card payments in person.',
  'sw.bs.which.till': 'Want a till for products, receipts and cashing up? Turn on Checkout, and Card payments in person to take cards at it.',
  'sw.bs.switch': 'Use Checkout',
  'sw.bs.off.help': 'Switching on asks you to confirm, then helps you set it up. You can switch it off whenever you like. Nothing is deleted.',
  // The web's sw.bs.on.help names Settings, Checkout; in the app that place is Checkout settings.
  'app.sw.bs.on.help': 'Gift vouchers, the loyalty card, the online shop and the rest of Checkout are set up in Checkout settings.',
  'sw.bs.settings': 'Open Checkout settings',
  'sw.bs.managed': 'ResNeo manages Checkout for {venue} at the moment. Contact ResNeo support to change it.',
  // (app) The link after app.sw.na.billing (the web's sw.na.billing.link is "Settings, Plan").
  'app.sw.na.billing.link': 'Open Plan & payments',

  // (app) The way back while Checkout is off (design section 7.2).
  'app.sw.salesHistory.hint': 'Past sales and refunds',

  // Refusals and errors.
  'sw.error.load': "We couldn't load your Checkout settings. Please try again.",
  'sw.error.network': "We couldn't reach ResNeo. Check your connection and try again.",
  'sw.error.save': "We couldn't save that. Please try again.",
  'sw.error.notAdmin': 'Only an admin can switch Checkout on or off.',
  'sw.error.stale': "Someone else changed Checkout while you were looking. We've loaded the latest. Check it, then try again.",
  'sw.error.tryAgain': 'Try again',
  // (app) The share sheet could not be opened with the list.
  'app.sw.error.download': "We couldn't download the list. Please try again.",
} as const;

export type SwitchCopyId = keyof typeof SWITCH_COPY;
export type SwitchT = (id: SwitchCopyId, vars?: CopyVars) => string;

/** One string, filled. A count of one uses the `<id>.one` wording when the deck has one. */
export function swT(id: SwitchCopyId, vars: CopyVars = {}): string {
  const one = `${id}.one`;
  if (Number(vars.count) === 1 && one in SWITCH_COPY) return fillCopy(SWITCH_COPY[one as SwitchCopyId], vars);
  return fillCopy(SWITCH_COPY[id], vars);
}

const EXTRA_SHORT: Record<PosSwitchExtraKey, 'vouchers' | 'loyalty' | 'shop'> = {
  pos_gift_vouchers_enabled: 'vouchers',
  pos_loyalty_enabled: 'loyalty',
  pos_online_shop_enabled: 'shop',
};

/** The web's short name for an extra, used in its copy ids. */
export function extraShort(key: PosSwitchExtraKey): 'vouchers' | 'loyalty' | 'shop' {
  return EXTRA_SHORT[key];
}

/** "Checkout", "Gift vouchers", "Loyalty card", "Online shop". */
export function switchName(key: PosSwitchKey): string {
  return key === 'pos_enabled' ? SWITCH_COPY['app.sw.tile'] : SWITCH_COPY[`sw.extra.${EXTRA_SHORT[key]}`];
}

/** The landing's extra as A2 draws it: the name, then what it does (the web's `extraLanding`). */
export function extraLanding(key: PosSwitchExtraKey): { name: string; description: string } {
  const full = SWITCH_COPY[`sw.landing.extras.${EXTRA_SHORT[key]}`];
  const name = switchName(key);
  return { name, description: full.startsWith(`${name}. `) ? full.slice(name.length + 2) : full };
}

/** "We'll switch Checkout on too" for the first extra chosen (the web's `alsoCheckoutSentence`). */
export function alsoCheckoutSentence(key: PosSwitchExtraKey): string {
  if (key === 'pos_gift_vouchers_enabled') return SWITCH_COPY['sw.on.alsoCheckout'];
  return SWITCH_COPY[key === 'pos_loyalty_enabled' ? 'sw.on.alsoCheckout.loyalty' : 'sw.on.alsoCheckout.shop'];
}
