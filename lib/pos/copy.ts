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

  // §18.32 Gift vouchers and account credit (Pass V), word for word from the web's
  // `src/components/pos/vouchers/voucher-copy.ts`: only the ids the app shows.
  'vch.ending': 'Gift voucher ending {last4}',
  'vch.status.active': 'Active',
  'vch.status.usedUp': 'Used up',
  'vch.status.expired': 'Expired',
  'vch.status.frozen': 'On hold',
  'vch.status.cancelled': 'Cancelled',
  'vch.balance': '{balance} left',
  'vch.expires': 'Use by {date}',
  'vch.noExpiry': 'No expiry date',
  'add.tab.vouchers': 'Gift vouchers',
  'vsell.preset': '{amount} gift voucher',
  'vsell.custom': 'Another amount',
  'vsell.title': 'Sell a gift voucher',
  'vsell.amount': 'Value',
  'vsell.amount.range': 'Between {min} and {max}',
  'vsell.amount.tooLow': 'The smallest voucher is {min}.',
  'vsell.amount.tooHigh': 'The largest voucher is {max}.',
  'vsell.who': "Who's it for?",
  'vsell.who.buyer': 'The person paying',
  'vsell.who.gift': 'A gift for someone else',
  'vsell.recipientName': 'Their name',
  'vsell.recipientEmail': 'Their email, to send it to them',
  'vsell.message': 'A message (optional)',
  'vsell.message.help': 'Printed on the voucher and in the email. Up to 300 characters.',
  'vsell.delivery': 'How should it reach them?',
  'vsell.delivery.print': 'Print it or hand it over now',
  'vsell.delivery.emailNow': 'Email it now',
  'vsell.delivery.emailLater': 'Email it on a date',
  'vsell.sendDate': 'Date to send',
  'vsell.sendDate.help': 'It arrives at about 8am that day.',
  'vsell.buyerEmail': 'Email for the receipt (optional)',
  'vsell.add': 'Add to sale',
  'line.voucher': 'Gift voucher, {amount}',
  'line.voucher.for': 'For {recipientName}',
  'line.voucher.delivery.print': 'To print or hand over',
  'line.voucher.delivery.now': "Emailed when it's paid for",
  'line.voucher.delivery.later': 'Emailed on {date}',
  'line.voucher.noDiscount': "Gift vouchers can't be discounted.",
  'totals.voucher': 'Gift voucher',
  'totals.credit': 'Account credit',
  'done.voucher.issued': 'Gift voucher ending {last4} is ready.',
  'done.voucher.pdf': 'Print or download the voucher',
  'done.voucher.scheduled': "We'll email it to {recipientName} on {date}.",
  'pay.method.voucher': 'Gift voucher',
  'pay.method.credit': 'Account credit',
  'pay.voucher.row': 'Gift voucher ending {last4}',
  'vpay.title': 'Pay with a gift voucher',
  'vpay.code': 'Voucher code',
  'vpay.code.help': 'Type the 12 characters, or scan the QR code on the voucher.',
  'vpay.code.invalid': "That doesn't look like a voucher code. Check it and try again.",
  'vpay.find': 'Find voucher',
  'vpay.found': 'Gift voucher ending {last4}',
  'vpay.balance': '{balance} left',
  'vpay.expires': 'Use by {date}',
  'vpay.noExpiry': 'No expiry date',
  'vpay.for': 'For {recipientName}',
  'vpay.amount': 'Amount to take',
  'vpay.amount.max': 'Up to {amount}',
  'vpay.confirm': 'Take {amount} from the voucher',
  'vpay.left': "Done. There's {balance} left on the voucher.",
  'vpay.useBalance': 'Take {balance}',
  'vpay.usedUp': 'This gift voucher has been used up.',
  'vpay.cancelled': "This gift voucher was cancelled, so it can't be used.",
  'vpay.notForVouchers': "Gift vouchers and account credit can't pay for another gift voucher. Take {amount} another way.",
  'cpay.title': 'Pay with account credit',
  'cpay.available': '{clientName} has {amount} credit',
  'cpay.amount': 'Amount to use',
  'cpay.confirm': 'Use {amount} of credit',
  'cpay.clientLocked':
    "Account credit has been used on this sale, so you can't change the {client}. Refund the credit payment first.",
  'refund.dest.credit': 'Account credit',
  'refund.dest.voucher': 'Back to the gift voucher ending {last4}',
  'refund.dest.voucherExpired': "The voucher has run out, so this goes to {clientName}'s account credit instead.",
  'refund.needsClient': 'Add the {client} first, so the credit has somewhere to go.',
  'refund.voucherLine': "Refunds what's left on the voucher ({balance}) and cancels it.",
  'refund.voucherUsed': 'Part of this voucher has been used, so only an admin can refund it.',
  'refund.voucherUsedUp': "This voucher has been used up, so there's nothing left to refund.",
  'err.VOUCHER_NOT_FOUND': "We can't find a gift voucher with that code at {venue}. Check the code and try again.",
  'err.VOUCHER_EXPIRED': "This gift voucher ran out on {date}. An admin can extend it if you're happy to take it.",
  'err.VOUCHER_FROZEN': "This gift voucher is on hold while a payment dispute is open, so it can't be used yet.",
  'err.VOUCHER_INSUFFICIENT_BALANCE': 'This gift voucher only has {balance} left. Take {balance} from it, and the rest another way.',
  'err.CREDIT_INSUFFICIENT': '{clientName} only has {amount} of credit left.',
  'err.voucherLookupLimited': "That's a lot of codes in a short time. Wait a minute, then try again.",
  'client.sv.title': 'Credit and vouchers',
  'client.sv.credit': 'Account credit: {amount}',
  'client.sv.empty': 'No credit or gift vouchers yet.',

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
  'app.loading': 'Loading…',
  'reader.success.tip': 'Includes a {tip} tip',
  'app.home.mineAdminOnly': 'Ask an admin to see your sales and tips.',
  // App-only words for vouchers on a phone (UX spec §13: the share sheet in place of a download)
  'app.voucher.pdf': 'Share or print the voucher',
  'app.voucher.pdfFailed': "We couldn't open the voucher. Please try again.",
  // ── App step 2: card payments (UX spec §13.4, §18.12, §18.17, §18.26, §18.28, §18.35, §23) ──
  // Payment methods (§18.12, §3.19)
  'pay.method.cardReader': 'Card reader',
  'pay.method.link': 'Pay by link or QR code',
  'pay.method.savedCard': 'Card on file',
  'app.howToTap.title': 'How to use Tap to Pay on iPhone',
  'app.sendToReader': 'Send to {reader}',
  'app.web.readers': 'Card readers and printers',
  // The counter reader (§3.19.3; the web's `reader.*`)
  'reader.choose': 'Which reader?',
  'reader.status.online': 'Ready',
  'reader.status.offline': 'Offline',
  'reader.status.busy': 'Busy',
  'reader.sending': 'Sending {amount} to {reader}…',
  'reader.waiting.title': 'Waiting for the card',
  'reader.waiting.body': 'Ask {clientName} to tap, insert or swipe their card on {reader}.',
  'reader.waiting.tip': 'The reader will ask about a tip first.',
  'reader.cancel': 'Cancel',
  'reader.confirming': "The card went through on the reader. We're confirming it with Stripe…",
  'reader.slow': 'Still waiting. If {clientName} has walked away, cancel. If the card was charged, it will show here by itself.',
  'reader.success': 'Paid {amount} by {cardBrand} ending {last4}',
  'reader.success.plain': 'Paid {amount} on the card reader', // (added on the web) no card details came back
  'reader.declined.title': 'Card declined',
  'reader.declined.stillOpen': 'The payment is still open on the reader. Ask {clientName} to try again or use another card.',
  'reader.declined.pin': 'Their bank wants chip and PIN. Ask {clientName} to insert the card and enter their PIN.',
  'reader.movedAway': "{reader} is now registered to another business, so it can't take this payment. Use another reader or send a pay link.",
  'reader.tryAgain': 'Try again',
  'reader.cancelled': 'Payment cancelled. Nothing was taken.',
  'reader.useOther': 'Use another reader',
  'reader.useLink': 'Send a pay link instead',
  'reader.checking': "Checking with the bank. This can take a few minutes. Don't take the payment again.",
  'reader.failed.title': "The payment didn't go through", // (added on the web)
  'reader.none': 'Add a card reader in Settings, Checkout to take cards here.', // (added on the web)
  'err.invalid_state': "This card payment has already gone through, so it can't be cancelled. If it was a mistake, refund it.",
  // Saving a card (§13.4 "Saving a card on the phone", §18.12, §18.28)
  'reader.consent.text':
    'Save this card so {venue} can take payments for your future visits when you agree to them. You can ask them to remove it at any time.',
  'reader.saved': 'Card saved for next time.',
  'reader.notSaved': "{clientName} didn't agree, so the card wasn't saved. The payment went through.",
  'reader.notSaved.wallet':
    "The payment went through, but the card wasn't saved. Phone and watch payments sometimes can't be kept for next time. Ask {clientName} to use their card instead if they'd like it saved.",
  'app.saveCard.handTo': 'Hand the phone to {clientName} so they can choose whether to save their card.',
  'app.saveCard.title': 'Save your card for next time?',
  'app.saveCard.agree': 'Yes, save my card',
  'app.saveCard.decline': 'No thanks',
  'app.saveCard.handBack': 'Thank you. Please hand the phone back.',
  'app.saveCard.ready': 'I have handed it over', // (added) staff's button on the hand-over screen
  // Pay by link or QR code (§3.19.4, §3.29; the web's `link.*`)
  'link.title': 'Pay by link or QR code', // (added on the web)
  'link.amount': 'Amount on this link', // (added on the web)
  'link.tipNote': 'The {client} can add a tip on their phone.',
  'link.allowTip': 'Let them add a tip on their phone', // (added on the web)
  'link.create': 'Create link',
  'link.scan': "Ask {clientName} to scan this with their phone's camera.",
  'link.qrAlt': 'QR code for the pay link', // (added on the web)
  'link.copy': 'Copy link',
  'link.copied': 'Link copied.', // (added on the web)
  'link.share': 'Share link', // (added) the phone's share sheet
  'link.text': 'Text it',
  'link.email': 'Email it',
  'link.text.to': 'Mobile number',
  'link.email.to': 'Email address',
  'link.send': 'Send', // (added on the web)
  'link.sent.text': 'Sent to {phone}.',
  'link.sent.email': 'Sent to {email}.',
  'link.waiting': 'Waiting for {clientName} to pay',
  'link.waitingAmount': 'Waiting for {amount} on a pay link', // (added on the web)
  'link.expires': 'The link works until {time} on {date}.',
  'link.cancel': 'Cancel link',
  'link.cancel.confirm.title': 'Cancel this pay link?',
  'link.cancel.confirm.body': 'The link stops working straight away. Nothing has been paid on it.',
  'link.cancel.confirm.button': 'Cancel link', // (added on the web)
  'link.cancel.keep': 'Keep it', // (added on the web)
  'link.paid': '{clientName} paid {amount}',
  'link.later': 'They can pay later. Park this sale, and it updates by itself when they pay.',
  'link.attemptFailed': 'A card was declined on the link. {clientName} can try another card.',
  'link.list': 'Pay links', // (added on the web)
  'link.status.cancelled': 'Cancelled', // (added on the web)
  'link.status.expired': 'Expired', // (added on the web)
  'link.show': 'Show QR code', // (added on the web)
  'link.back': 'Choose another way to pay',
  'link.close': 'Close', // (added on the web)
  'done.tipLink': 'Send a tip link',
  'link.tipOnly.title': 'Send {clientName} a tip link?',
  'link.tipOnly.body':
    "They've paid in full. If they'd like to leave a tip later, this link lets them choose an amount on their phone. Nothing is charged unless they choose one.",
  'link.tipOnly.send': 'Send tip link',
  'link.tipOnly.sent': 'Tip link sent to {destination}.',
  'link.tipOnly.how': 'How should we send it?', // (added on the web)
  // Card on file (§3.19.5, §4.3, §18.12, §18.17)
  'saved.card': '{brand} ending {last4}, expires {expiry}',
  'saved.consent': 'Saved with permission on {date}, {channel}',
  'saved.channel.reader': 'at the desk',
  'saved.channel.app': 'on the phone at the desk', // (added on the web)
  'saved.channel.online_booking': 'when booking online',
  'saved.channel.shop': 'in the online shop',
  'saved.channel.account': 'in their account',
  'saved.confirm.title': 'Charge {amount} to {brand} ending {last4}?',
  'saved.confirm.body': 'Only charge a saved card when {clientName} has agreed to this payment.',
  'saved.confirm.button': 'Charge card',
  'saved.processing': 'Charging the card…',
  'saved.method': 'Card on file: {brand} ending {last4}', // (added on the web)
  'saved.notCharged': "The card on file wasn't charged", // (added on the web)
  'saved.declined': 'The card was declined. Ask {clientName} to try another card or another way to pay.', // (added on the web)
  'client.cards.title': 'Saved cards',
  'client.cards.remove': 'Remove card',
  'client.cards.remove.title': 'Remove this card?',
  'client.cards.remove.body': "{venue} won't be able to charge it again. {clientName} can save it again next time they pay.",
  'client.cards.empty': 'No saved cards.',
  'client.cards.removed': '{card} removed.', // (added on the web)
  'client.cards.loadFailed': "We couldn't load the saved cards.", // (added on the web)
  // Payouts and fees, for admins (§11.1, §18.26; instant payouts are v1.x)
  'rep.t.payouts': 'Payouts and fees',
  'rep.payout.arrives': 'Arrives',
  'rep.payout.amount': 'Amount',
  'rep.payout.fees': 'Stripe fees',
  'rep.payout.status': 'Status',
  'rep.payout.intro': 'What Stripe is sending to your bank for this period, and the fees it took. Open a payout to see the payments it covered.', // (added on the web)
  'rep.payout.notConnected': 'Connect Stripe in Settings, Payments to see your payouts here.', // (added on the web)
  'rep.payout.none': 'No payouts arrive in this period.', // (added)
  'rep.payout.truncated': 'Showing the first 40 payouts. Choose a shorter period to see the rest.', // (added on the web)
  'rep.payout.feesNotListed': 'Not listed', // (added on the web)
  'rep.payout.show': 'Show payments', // (added on the web)
  'rep.payout.hide': 'Hide', // (added on the web)
  'rep.payout.manual': "This payout was made by hand in Stripe, so Stripe doesn't list what it covered.", // (added on the web)
  'rep.payout.covered': 'What this payout covered', // (added on the web)
  'rep.payout.paidOut': 'Paid out', // (added on the web)
  'rep.payout.status.paid': 'Paid', // (added on the web)
  'rep.payout.status.on_its_way': 'On its way', // (added on the web)
  'rep.payout.status.pending': 'Pending', // (added on the web)
  'rep.payout.status.failed': 'Failed', // (added on the web)
  'rep.payout.status.cancelled': 'Cancelled', // (added on the web)
  // Send to a phone: the app side (§18.35, §23.5)
  'pay.phone.row': "Card, on {staffName}'s phone",
  'err.POS_PAYMENT_CLAIMED': '{staffName} has already taken this payment on their phone.',
  'err.POS_COLLECT_EXPIRED': 'Nobody took this payment in time. Send it again.',
  'err.POS_NO_CARD_DEVICE': 'No phone here can take cards. Send a pay link instead.',
  'app.collect.list.title': 'Waiting for you',
  'app.collect.row': '{amount} for Sale {saleNo}, from {staffName}',
  'app.collect.row.any': 'For anyone',
  'app.collect.row.expires': '{seconds} seconds left to take it',
  'app.collect.title': 'Take {amount}',
  'app.collect.for': 'Sale {saleNo} at {till}, sent by {staffName}',
  'app.collect.client': 'For {clientName}',
  'app.collect.processing': 'Processing',
  'app.collect.done': 'Paid. The desk can see it.',
  'app.collect.declined': 'The card was declined. Try again, or ask for another card.',
  'app.collect.tryAgain': 'Try again',
  'app.collect.insertCard':
    "This card needs to be inserted with a PIN, and a phone can't do that. Send a pay link, or try another card.",
  'app.collect.sendLink': 'Send a pay link',
  'app.collect.otherCard': 'Try another card',
  'app.collect.useCounter': 'Use the card reader at the desk',
  'app.collect.timeout': "The card wasn't tapped within 5 minutes, so this stopped. Nothing was taken.",
  'app.collect.cancelledByDesk': 'The desk cancelled this payment. Nothing was taken.',
  'app.collect.accountLimit':
    "This iPhone has taken Tap to Pay payments for three businesses in the last 24 hours, which is Stripe's limit. Use another phone, or try again later.",
  'app.collect.expired': 'Nobody took this payment in time, so it was cancelled. Nothing was taken.', // (added) phone.expired, as the phone says it
  'app.collect.gone': 'This payment has ended. Nothing more to do here.', // (added) paid, cancelled or failed before this phone took it
  'app.collect.otherVenue': 'This payment is for another business. Switch to it in the app, then open it again.', // (added)
  'app.collect.someone': 'Someone at the desk', // (added) when the sender is not known
  'app.collect.desk': 'the desk', // (added) when the till has no name
  'app.collect.backToSale': 'Open the sale', // (added)
  'app.collect.close': 'Done', // (added)
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
