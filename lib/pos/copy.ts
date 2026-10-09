/**
 * Checkout's words in the app (Docs/pos-retail-ux-spec.md §18 on the web), keyed by the web's copy
 * ids and written word for word from the copy deck. The web's till keeps the same deck in
 * `src/components/pos/copy.ts`; the entries below are copied from it unchanged (UX spec §13: the app
 * keeps its own copy file and reuses the web's ids), then the app's own `app.*` strings follow.
 *
 * Placeholders are in {braces}. `{client}` and `{Client}` are the venue's own word for its clients,
 * filled by `usePosCopy`. Money arrives already formatted, so no currency symbol sits next to a
 * money placeholder.
 *
 * Rules `copy.test.ts` enforces: no em-dash anywhere, straight apostrophes, and every placeholder a
 * caller can fill.
 */
export const POS_COPY = {
  // §18.1 Common
  'common.cancel': 'Cancel',
  'common.save': 'Save changes',
  'common.tryAgain': 'Try again',
  'common.networkError': "We couldn't reach ResNeo. Check your connection and try again.",
  'common.saveError': "We couldn't save that. Please try again.",

  // §18.2 Navigation, Sales history and support sessions
  'nav.checkout': 'Checkout',
  'hist.banner': 'Checkout is switched off for {venue}. You can still see past sales and give refunds.',
  'hist.link': 'Sales history',
  'support.banner':
    "You're signed in as ResNeo support. You can look at everything, but you can't take payments, refund, void, cash up or add card readers.",
  'support.disabled': "ResNeo support can't do this.",

  // §18.3 Checkout home, queue and sales lists
  'till.title': 'Checkout',
  'till.newSale': 'New sale',
  'till.tab.queue': 'Ready to check out',
  'till.tab.open': 'Open sales',
  'till.tab.all': 'All sales',
  'till.live': 'Live',
  'till.reconnecting': 'Reconnecting',
  'till.device.chip': 'Till: {till}',
  'till.device.title': 'Which till is this?',
  'till.device.body':
    'Choose the till this device is used at. Cash and card reader payments are recorded against it. You can change it later.',
  'till.device.confirm': 'Use this till',
  'till.error.title': "We couldn't open Checkout",
  'till.error.body': 'Something went wrong loading your till. Please try again.',
  'till.off.title': "Checkout isn't switched on",
  'till.off.body': "Checkout isn't available for {venue} yet. If you think it should be, contact ResNeo support.",
  'till.lapsed.title': 'Your plan needs attention',
  'till.lapsed.body':
    "You can't take new payments until your subscription is sorted. You can still see sales, give refunds, cash up and hand over paid orders.",
  'till.currency.title': 'Checkout works in pounds for now',
  'till.currency.body':
    "{venue} uses {currency}, and Checkout only works in pounds in this version. We'll let you know when euros are supported.",
  'queue.date': 'Day',
  'queue.filter.mine': 'Only mine',
  'queue.due': '{amount} to pay',
  'queue.status.started': 'In progress',
  'queue.status.completed': 'Completed',
  'queue.status.arrived': 'Arrived',
  'queue.chip.deposit': 'Deposit paid {amount}',
  'queue.chip.openSale': 'Sale {saleNo} open',
  'queue.chip.class': '{modelName} booking',
  'queue.chip.noPrice': 'No price yet',
  'queue.checkout': 'Check out',
  'queue.empty.title': 'Nobody waiting to pay',
  'queue.empty.body':
    'When a {client} arrives, or their appointment starts or finishes, they appear here so you can check them out in one tap.',
  'queue.error': "We couldn't load who's ready to pay.",
  'sales.walkIn': 'Walk-in',
  'sales.items': '{count} items',
  'sales.items.one': '1 item',
  'sales.pill.cardPending': 'Card payment in progress',
  'sales.parkedBy': 'Parked by {staffName} on {device} at {time}',
  'sales.startedBy': 'Started by {staffName} at {time}',
  'sales.resume': 'Resume',
  'sales.filter.all': 'All',
  'sales.filter.parked': 'Parked',
  'sales.filter.partPaid': 'Part paid',
  'sales.filter.mine': 'Mine',
  'sales.empty.title': 'No open sales',
  'sales.empty.body': 'Sales you park, or leave part paid, wait here for anyone to finish on any device.',
  'sales.search': 'Search by sale number, name or amount',
  'sales.filter.dates': 'Dates',
  'sales.filter.status': 'Status',
  'sales.channel.till': 'Till',
  'sales.channel.app': 'App',
  'sales.channel.online': 'Online',
  'sales.filter.refunded': 'Refunded',
  'sales.loadMore': 'Show more',
  'sales.none.filtered': 'No sales match these filters.',

  // §18.4 The sale screen, lines and totals
  'sale.title': 'Sale {saleNo}',
  'sale.status.open': 'Open',
  'sale.status.parked': 'Parked',
  'sale.status.part_paid': 'Part paid',
  'sale.status.completed': 'Paid',
  'sale.status.voided': 'Voided',
  'sale.status.pending_payment': 'Waiting for payment',
  'sale.status.expired': 'Expired',
  'sale.refund.partial': 'Part refunded',
  'sale.refund.full': 'Refunded',
  'sale.more': 'More',
  'sale.park': 'Park sale',
  'sale.addBooking': 'Add another booking',
  'sale.notes': 'Add a note',
  'sale.notes.label': 'Note',
  'sale.notes.help': "Only your team sees this. It isn't printed on receipts.",
  'sale.void': 'Void sale',
  'sale.discount': 'Add a discount',
  'sale.bar.balance': '{balance} to pay',
  'sale.pay.open': 'Take payment',
  'sale.notFound.title': "We can't find this sale",
  'sale.notFound.body': 'It may belong to another venue, or the link is wrong.',
  'sale.notFound.back': 'Back to Checkout',
  'sale.completedLine': 'Paid on {date} at {time}. Served by {staffName}.',
  'sale.voidedLine': 'Voided on {date} at {time} by {staffName}: {reason}',
  'sale.refundAndVoid': 'Refund and cancel',
  'sale.done.receipt': 'Send receipt',
  'sale.done.refund': 'Refund',
  'line.qtyPrefix': '{count} x',
  'line.chip.discount': '{amount} off',
  'line.chip.priceChanged': 'Price changed from {listPrice}',
  'line.chip.paid': 'Paid',
  'line.chip.walkIn': "Walk-in, in {staffName}'s diary",
  'line.chip.custom': 'Custom item',
  'line.chip.fee': 'Fee',
  'line.chip.age18': '18+',
  'line.class.credit': 'Paid with {entitlement}',
  'totals.subtotal': 'Subtotal',
  'totals.discounts': 'Discounts',
  'totals.total': 'Total',
  'totals.vatIncluded': 'Includes VAT of {amount}',
  'totals.depositApplied': 'Deposit paid online',
  'totals.priorPayment': 'Paid earlier',
  'totals.returned': 'Returned',
  'totals.paid': 'Paid today',
  'totals.pending': 'Payment in progress',
  'totals.linkReserved': 'On pay links sent',
  'totals.balance': 'Still to pay',
  'totals.balanceZero': 'Nothing left to pay',
  'totals.tips': 'Tips',
  'totals.tips.note': "Tips aren't part of the total.",

  // §18.5 Adding items
  'add.open': 'Add items',
  'add.done': 'Done',
  'add.search.placeholder': 'Search services and products, or scan a barcode',
  'add.tab.favourites': 'Favourites',
  'add.tab.services': 'Services',
  'add.tab.custom': 'Custom',
  'add.options': '{count} options',
  'add.from': 'From {amount}',
  'add.none': 'Nothing matches "{query}".',
  'add.fav.empty': 'No favourites yet. Add the things you sell most, for one-tap selling.',
  'add.fav.suggested': 'Your best sellers from the last 30 days. An admin can choose your own.',
  'add.fee': 'Add a fee',
  'walkin.title': 'Who did this service?',
  'walkin.body':
    "We'll add it to their diary as a walk-in that ends now, so their day and the {client}'s history stay right.",
  'walkin.option': 'Option',
  'walkin.sameVisit': 'It joins the visit already on this sale.',
  'walkin.confirm': 'Add service',
  'custom.name': 'Item name',
  'custom.price': 'Price',
  'custom.kind': 'Counts as',
  'custom.kind.service': 'A service',
  'custom.kind.product': 'A product',
  'custom.kind.other': 'Something else',
  'custom.vat': 'VAT rate',
  'custom.add': 'Add to sale',
  'fee.lateCancel': 'Late cancellation fee',
  'fee.noShow': 'No-show fee',
  'fee.other': 'Another fee',
  'fee.help': 'For a fee paid at the desk. Fees already charged to a saved card show on the booking, not here.',
  'fee.add': 'Add fee',
  'age.reminder': 'Check the {client} is 18 or over before you sell {product}.',

  // §18.6 The line editor and credit
  'line.option': 'Option',
  'line.qty': 'Quantity',
  'line.qty.fixed': 'Set by the booking',
  'line.price': 'Price',
  'line.price.change': 'Change price',
  'line.remove': 'Remove from sale',
  'line.remove.booking': 'Take off this sale',
  'line.remove.bookingConfirm.title': 'Take {service} off this sale?',
  'line.remove.bookingConfirm.body': 'The booking stays in the diary, and you can check it out on its own.',
  'line.remove.walkInConfirm.body':
    "This takes it off the sale and cancels the walk-in booking it added to {staffName}'s diary.",
  'line.save': 'Done',
  'price.reason': 'Reason for the change',
  'price.reason.longer': 'Took longer than booked',
  'price.reason.shorter': 'Shorter than booked',
  'price.reason.match': 'Price match',
  'price.reason.correction': 'Correcting a mistake',
  'price.help': 'We keep the original price for your records and reports.',
  'price.reset': 'Use the original price',
  'attr.title': 'Who gets credit for {item}?',
  'attr.help': "Credit is used in sales reports and for tips. It doesn't change the diary.",
  'attr.reason': 'Why are you changing who gets credit?',
  'attr.sharedReadOnly': 'Shared between {names}. To change it, choose one person.',

  // §18.7 The client on a sale
  'client.add': 'Add {client}',
  'client.open': 'Open profile',
  'client.change': 'Change {client}',
  'client.remove': 'Remove from sale',
  'client.title': 'Add a {client}',
  'client.search': 'Search by name, phone or email',
  'client.new': 'New {client}',
  'client.walkIn': 'Carry on without a {client}',
  'client.changeBooking': 'The bookings on this sale stay with {clientName}. Only the sale changes.',

  // §18.8 Discounts
  'disc.title': 'Add a discount',
  'disc.scope.sale': 'Whole sale',
  'disc.scope.line': '{item} only',
  'disc.tab.manual': 'Percent or amount',
  'disc.tab.preset': 'Presets',
  'disc.kind.percent': 'Percent',
  'disc.kind.amount': 'Amount',
  'disc.reason': 'Reason',
  'disc.reason.other': 'Other',
  'disc.preview': 'Takes {amount} off. New total {total}.',
  'disc.preset.max': 'Up to {amount}',
  'disc.apply': 'Apply discount',
  'disc.remove': 'Remove discount',

  // §18.9 Combine, park and void
  'attach.title': 'Add another booking',
  'attach.body': 'For one person paying for another visit, like a parent paying for a child.',
  'attach.search': "Search today's bookings",
  'attach.sales': 'Or combine with an open sale',
  'attach.done': "Added {clientName}'s booking to this sale.",
  'attach.inOtherSale': 'That booking is already on Sale {saleNo}. Open that sale, or combine the two into this one?',
  'attach.openOther': 'Open Sale {saleNo}',
  'attach.combine': 'Combine sales',
  'attach.pendingBlock': 'You can combine these once no payment is in progress on either sale.',
  'attach.bothPaid': "Both sales already have payments, so they can't be combined. Finish each one on its own.",
  'attach.movedInto': 'Combined into Sale {saleNo}, which already had a payment.',
  'park.title': 'Park this sale?',
  'park.body': 'It waits in Open sales, so anyone can finish it on any device.',
  'park.note': 'Note (optional)',
  'park.confirm': 'Park sale',
  'park.done': 'Sale {saleNo} parked.',
  'park.banner': 'Parked by {staffName} on {device} at {time}. {note}',
  'park.resume': 'Resume',
  'void.title': 'Void Sale {saleNo}?',
  'void.body': 'The sale is cancelled and kept in your records as voided. Use this for mistakes.',
  'void.bookings': 'The bookings on it go back to unpaid, so they can be checked out again.',
  'void.walkIns': 'Walk-in services added on this sale are cancelled in the diary too.',
  'void.reason': 'Reason',
  'void.confirm': 'Void sale',
  'rv.pending': "We'll void the sale once the card refund is confirmed. This usually takes a few seconds.",
  'rv.failed':
    "A card refund didn't go through, so the sale is still part paid. Refund that payment another way to finish cancelling.",

  // §18.10 Who is serving
  'serving.chip': 'Serving: {staffName}',
  'serving.title': "Who's serving?",
  'serving.search': 'Search the team',
  'serving.help':
    'Sales and tips are credited to the person serving. What anyone can do still depends on who is signed in.',
  'serving.adminDevice':
    'This device is signed in as {loginName}, an admin, so whoever is serving can do everything an admin can.',

  // §18.11 Tips
  'tip.label': 'Tip',
  'tip.none': 'No tip',
  'tip.add': 'Add a tip',
  'tip.preset': '{percent}% ({amount})',
  'tip.preset.amount': '{amount}',
  'tip.custom': 'Another amount',
  'tip.noTip': 'No tip',
  'tip.base.services': 'Percentages are worked out on services only ({amount}).',
  'tip.base.total': 'Percentages are worked out on the whole bill ({amount}).',
  'tip.goesTo': 'Goes to {allocation}',
  'tip.goesTo.change': 'Change',
  'tip.rule.pro_rata_services': 'In proportion to their services',
  'tip.rule.equal_performers': 'Equally between the people who did the services',
  'tip.rule.operator': 'All to {staffName}',
  'tip.rule.manual': 'Choose amounts',
  'tip.alloc.total': 'Shared {allocated} of {tip}',
  'tip.alloc.reason': 'Why are you changing it?',
  'tip.retailOnly': 'Tips on product-only sales go to whoever sold them.',
  'tip.policy.link': 'Read the tipping policy',

  // §18.12 The payment panel
  'pay.title': 'Take payment',
  'pay.noPermission': "You can't take payments on this login. Ask an admin to take it, or to give you permission.",
  'pay.amount': 'Amount to pay now',
  'pay.amount.part': 'Paying part now leaves {remaining} to pay.',
  'pay.splitEvenly': 'Split evenly',
  'pay.method.cash': 'Cash',
  'pay.method.other': 'Other: {typeName}',
  'pay.locked': 'Finish or cancel the payment in progress first.',
  'pay.list': 'Payments on this sale',
  'pay.status.pending': 'In progress',
  'pay.status.succeeded': 'Paid',
  'pay.status.failed': 'Failed',
  'pay.status.cancelled': 'Cancelled',
  'pay.otherWay': 'Choose another way to pay',
  'pay.applied.deposit': 'Deposit paid online',
  'pay.applied.prior': 'Paid earlier',
  'pay.finish': 'Complete',
  'pay.finish.help': 'This is already paid in full. Add anything else, or press Complete to finish.',
  'cash.title': 'Cash',
  'cash.due': '{amount} to pay',
  'cash.tendered': 'Cash handed over',
  'cash.exact': 'Exact amount',
  'cash.change': 'Change to give: {amount}',
  'cash.keepChange': 'Keep the change as a tip ({amount})',
  'cash.confirm': 'Record {amount} in cash',
  'other.help':
    'For money taken outside ResNeo, like another card machine or a bank transfer. It shows in your takings under its own name.',
  'other.reference': 'Reference',
  'other.reference.required': "Add the reference, like the last four digits on the card machine's slip.",
  'other.confirm': 'Record {amount} by {typeName}',
  'part.banner': '{paid} paid. {balance} still to pay.',
  'part.park': 'Finish later',

  // §18.13 Completion and a completed sale
  'done.title': 'Paid in full',
  'done.titleZero': 'All done',
  'done.change': 'Give {amount} change',
  'done.summary': '{total} paid by {methods}',
  'done.tip': 'Tip {amount}, going to {allocation}',
  'done.receipt.email': 'Email receipt',
  'done.receipt.text': 'Text receipt',
  'done.receipt.none': 'No receipt',
  'done.receipt.to': 'Email address or mobile number',
  'done.receipt.sentAuto': 'Receipt emailed to {email}.',
  'done.receipt.sent': 'Receipt sent to {destination}.',
  'done.bookNext': 'Book next appointment',
  'done.next': 'Next {client}',
  'done.newSale': 'New sale',
  'done.tips.change': 'Change tip split',
  'done.credit.change': 'Change who gets credit',

  // §18.14 Refunds
  'refund.title': 'Refund Sale {saleNo}',
  'refund.what': 'What are you refunding?',
  'refund.byItems': 'Items',
  'refund.byAmount': 'An amount',
  'refund.bookingLine': "The booking itself isn't changed.",
  'refund.tip': 'Also refund the tip ({tip})',
  'refund.where': 'Where should the money go?',
  'refund.dest.original': 'Back to {method}',
  'refund.dest.cash': 'Cash from the till',
  'refund.dest.other': 'Another way',
  'refund.spans': 'This refund is split across {count} payments, cards first.',
  'refund.reason': 'Reason',
  'refund.note': 'Note (optional)',
  'refund.summary': 'Refund {amount} to {destination}',
  'refund.confirm': 'Refund {amount}',
  'refund.sentCard': "Refund sent. It usually reaches {clientName}'s account in 5 to 10 working days.",
  'refund.doneCash': 'Give {clientName} {amount} from the till.',
  'refund.doneOther': 'Refund of {amount} recorded as {typeName}.',
  'refund.failed':
    "The card refund didn't go through: {reason}. Refund in cash or another way. Any items returned stay recorded.",
  'refund.waitingFunds':
    "Stripe is holding this refund until there's enough in your Stripe balance. It goes through by itself as new payments come in. If {clientName} needs it now, refund another way.",
  'refund.external': 'Refunded in Stripe',
  'refund.external.note':
    "Someone refunded this in your Stripe dashboard, so we've recorded it here. No items were put back in stock.",
  'refund.status.pending': 'Processing',
  'refund.status.waitingFunds': 'Waiting for funds',
  'refund.status.succeeded': 'Refunded',
  'refund.status.failed': 'Failed',

  // §18.15 Stale sales and offline
  'stale.notice': "This sale was changed on another device, so we've loaded the latest version. Check it, then carry on.",
  'stale.dialog': 'This sale changed while you were working. Check the details, then apply again.',
  'stale.payment':
    "The sale changed before the payment started, so nothing was taken. It's now {balance} to pay. Check it, then take payment again.",
  'stale.live': 'Updated just now on another device.',
  'stale.closed.completed': 'This sale was paid on another device.',
  'stale.closed.voided': 'This sale was voided on another device.',
  'offline.banner': "You're offline. Everything up to your last change is saved. We'll carry on when you're back.",
  'offline.disabled': 'Reconnect to do this.',

  // §18.16 Error sentences the till fills itself (the server writes the rest)
  'err.POS_AMOUNT_EXCEEDS_BALANCE': "That's more than the {balance} still to pay. Enter {balance} or less.",
  'err.ceiling':
    "That's more than {max}, the largest single payment {venue} allows. Check the amount, or ask an admin to change the limit in Settings, Checkout.",
  'err.attachConflict': "That booking is already on Sale {saleNo}, which has been paid, so it can't be added here.",
  'err.POS_TIPS_DO_NOT_ADD_UP': 'The shares add up to {allocated}, but the tip is {tip}. Change them so they add up to {tip}.',

  // §18.17 Booking detail and calendar
  'bk.checkout': 'Check out',
  'bk.checkout.opening': 'Opening checkout…',
  'bk.takeFee': 'Take a fee',
  'cal.checkout': 'Check out',
  'cal.checkout.short': 'Pay',

  // §18.31 Hard limits
  'limit.discount': "That's more than your {limit}% discount limit. An admin can give a bigger discount.",
  'limit.price': "You can't change prices on your login. An admin can change it for you.",
  'limit.refund': "You can't give refunds on your login. An admin can give this refund.",
  'limit.refundMethod': 'Only an admin can refund to a different method from the original payment.',
  'limit.howTo':
    'Park the sale if you need to. An admin can open it on their own login, on any device or in the app, and finish it there.',

  // §18.28 The ResNeo app (staff)
  'app.tile.checkout': 'Checkout',
  'app.tile.checkout.hint': "Take payments and see today's sales",
  'app.tapToPay': 'Tap to Pay on this phone',
  'app.tapToPay.iphone': 'Tap to Pay on iPhone',
  'app.bluetoothReader': 'Card reader (Bluetooth)',
  'app.tip.title': 'Would you like to add a tip?',
  'app.receipt.sentTo': 'Receipt sent to {destination}.',
  'app.receipt.notSent': 'No receipt sent.',
  'app.receipt.notSent.pos': 'No receipt sent. You can send one from the sale.',
  'app.balance.zero': 'Nothing left to pay',
  'app.reports.chips': 'Report tabs',
  'app.mine.title': 'Your sales and tips',
  'app.mine.today': 'Today',
  'app.mine.week': 'This week',
  'app.mine.sales': 'Sales credited to you: {amount}',
  'app.mine.tips': 'Your tips: {amount}',
  'app.mine.none': 'Nothing yet. Sales and tips credited to you will show here.',
  'app.web.group': 'On the web',
  'app.web.hint': 'Opens in your browser',
  'app.web.checkoutSettings': 'Checkout settings',
  'app.web.records': 'Records, reports and exports',
  'app.charge.timedOut': 'This payment timed out. Start it again.',

  // App-only words for a phone (UX spec §13.3: the app changes only what a phone needs)
  'app.pay.card': 'Card',
  'app.pay.cardHelp': 'Tap to Pay on this phone, or your Bluetooth card reader.',
  'app.pay.cardUnavailable': "Card payments can't be taken on this phone. Take cash or another way, or use the web till.",
  'app.pay.tipFirst': 'Choose a tip first, then hand over for the card.',
  'app.pay.withTip': 'Charge {amount}',
  'app.card.hold': "Hold the {client}'s card near the top of your phone.",
  'app.card.holdReader': 'Hold the card to the reader, or insert the chip.',
  'app.card.preparing': 'Getting the card reader ready.',
  'app.card.processing': 'Processing payment…',
  'app.card.cancel': 'Cancel',
  'app.card.back': 'Back',
  'app.card.retry': 'Try again',
  'app.card.useReader': 'Use card reader',
  'app.card.connectReader': 'Connect a card reader',
  'app.card.declined': 'The card was declined. Ask for another card, or take payment another way.',
  'app.card.notCompleted': "The payment didn't go through, so nothing was taken. Try again, or take payment another way.",
  'app.card.unsure':
    "We couldn't confirm the payment. Don't take it again: it will show on the sale by itself if it went through.",
  'app.card.cancelled': 'Payment cancelled. Nothing was taken.',
  'app.card.success': 'Paid {amount} by card.',
  'app.sale.serving': 'Serving',
  'app.sale.client': '{Client}',
  'app.sale.lines.empty': 'Nothing on this sale yet. Add a service, an item or a fee.',
  'app.sale.walkIn.choose': 'Choose who did it',
  'app.sale.reasonOther': 'Other reason',
  'app.sale.cardWaiting': 'A card payment is in progress on this sale.',
  'app.sale.cancelCard': 'Cancel the card payment',
  'app.sale.edit': 'Edit',
  'app.sale.backToSale': 'Back to the sale',
  'app.sale.custom.title': 'Add a custom item',
  'app.sale.fee.title': 'Add a fee',
  'app.sale.newSaleStarting': 'Starting a sale…',
  'app.sale.openFailed': "We couldn't open checkout. Please try again.",
  'app.sale.refundNothing': 'There is nothing left to refund on this sale.',
  'app.sale.refundFrom': 'From {method}',
  'app.sale.tipChange.title': 'Change tip split',
  'app.sale.tipChange.rule': 'Share it',
  'app.sale.credit.choose': 'Choose who gets credit',
  'app.home.mineAdminOnly': 'Ask an admin to see your sales and tips.',
} as const;

export type PosCopyId = keyof typeof POS_COPY;

export type CopyVars = Record<string, string | number>;

/** Fills `{name}` placeholders. Unknown placeholders are left as they are, so a test can spot them. */
export function fillCopy(template: string, vars: CopyVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

/** One string from the deck, filled. */
export function posCopy(id: PosCopyId, vars: CopyVars = {}): string {
  return fillCopy(POS_COPY[id], vars);
}

/** "client" becomes "Client". */
export function capitalise(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

export type PosT = (id: PosCopyId, vars?: CopyVars) => string;

/** A copy function with the venue's client word filled in (`{client}`, `{Client}`). */
export function posCopyFor(clientWord: string): PosT {
  const lower = (clientWord || 'client').toLowerCase();
  return (id, vars = {}) => posCopy(id, { client: lower, Client: capitalise(lower), ...vars });
}
