import { fillCopy, type CopyVars } from '@/lib/pos/copy';
import type { PosSetupStepId } from '@/types/pos-setup';

/**
 * The words for setting up Checkout in the app (POS test round 2026-10-11, Part 4; the design's
 * section 6.3 and 6.6 in reports/pos-qa-2026-10-11/part4-onboarding-proposal.md, the source of
 * truth for wording). Keys in the design's `setup.*` form are word for word the design's, so the
 * web wizard (`src/lib/pos/setup/copy.ts`) and the app say the same thing; `app.setup.*` keys are
 * the app's own: lines the phone needs that the web page does not (this phone, the Stripe return,
 * a refusal), and the lines where the web names a place the app does not have (Settings, Checkout
 * is Checkout settings here; Home is Today). OB5 (business details follow the profile) changed W5's
 * words, so its lines are the app's own too. OB10: no help articles, so the screens explain.
 *
 * Rules `copy.test.ts` enforces: no em-dash anywhere, straight apostrophes, no currency symbol next
 * to a money placeholder (money arrives formatted), no country or competitor named, no web-only
 * place named as if it were in the app, and every placeholder filled. A count of one uses the
 * `<id>.one` wording.
 */
export const SETUP_COPY = {
  // The frame every screen sits in.
  'setup.page.title': 'Set up Checkout',
  'setup.stepCount': 'Step {n} of {total}',
  'setup.saveLater': 'Save and finish later',
  'setup.skip': 'Skip for now',
  'setup.continue': 'Continue',
  'setup.error.save': "We couldn't save that. Please try again.",
  'app.setup.loadError.title': "We couldn't load your set-up",
  'setup.error.network': "We couldn't reach ResNeo. Check your connection and try again.",
  'setup.error.tryAgain': 'Try again',
  'app.setup.adminOnly.title': 'Admins only',
  'app.setup.adminOnly.body': 'Only an admin can set up Checkout. Ask an admin to finish setting it up.',
  'app.setup.off.title': 'Checkout is off',
  'app.setup.off.body': 'Your answers are kept. Switch Checkout back on to carry on setting it up.',
  'app.setup.toSettings': 'Go to Checkout settings',

  // W0. Welcome.
  'setup.welcome.title': "Let's get Checkout ready",
  // The web says "in Settings, Checkout"; the app's place is Checkout settings, in More.
  'app.setup.welcome.body':
    'A few quick questions, about five minutes. Your answers set things up for you, and you can change anything later in Checkout settings.',
  'setup.welcome.skipNote': 'Not sure about something? Skip it. Checkout already works for cash.',
  'setup.welcome.done.stripe': 'Stripe is connected',
  'setup.welcome.done.profile': 'Your business details are ready from your profile',
  'setup.welcome.start': "Let's go",
  'setup.welcome.later': "I'll do it later",
  'app.setup.welcome.missed': "Checkout is on, but we couldn't switch on {extras}. You can choose them again on the next screen.",

  // W1. What will you use Checkout for?
  'setup.use.title': 'What will you use Checkout for?',
  'setup.use.help': 'Tick everything that fits. You can add more later.',
  'setup.use.appointments': 'Take payment for appointments',
  'setup.use.appointments.note': 'Always included',
  'setup.use.products': 'Sell products',
  'setup.use.products.note': 'Shampoo, styling products, skincare, anything on your shelves',
  // Owner decision (Part 4): the online shop sells the venue's products, so Sell products stays on.
  'setup.use.products.shopNote': 'Your online shop sells products, so this stays ticked.',
  'setup.use.vouchers': 'Sell gift vouchers',
  'setup.use.vouchers.note': 'At your desk, and online if you like',
  'setup.use.loyalty': 'Run a loyalty card',
  'setup.use.loyalty.note': 'Reward clients who keep coming back',
  'setup.use.shop': 'Sell products online',
  'setup.use.shop.note': 'Collection from you, or delivery',
  'setup.use.continue': 'Continue',
  'app.setup.use.on': 'Already on. You can switch it off in Checkout settings.',
  'app.setup.use.paused': 'Paused by ResNeo',
  'app.setup.use.failed': "We couldn't switch on {extras}. You can try again in Checkout settings.",

  // W2. How do your clients pay?
  'setup.pay.title': 'How do your clients pay?',
  'setup.pay.help': 'Tick every way you take money. Each one shows as its own line in your takings.',
  'setup.pay.card': 'Card',
  'setup.pay.cash': 'Cash',
  'setup.pay.transfer': 'Bank transfer',
  'setup.pay.otherMachine': 'Another card machine',
  'setup.pay.otherMachine.note': "A card machine that isn't connected to ResNeo. You'll record those payments yourself.",
  'setup.pay.cash.count.title': 'Do you count the cash at the end of the day?',
  'setup.pay.cash.count.yes': 'Yes, help me count it',
  'setup.pay.cash.count.yes.note':
    "Open the till with a float in the morning, count it at the end of the day, and see if anything's missing.",
  'setup.pay.cash.count.no': 'No, just record it',
  'setup.pay.cash.float': 'Usual float (optional)',
  'setup.pay.cash.float.bad': 'Enter the float as an amount, like 50.00, or leave it empty.',

  // W3. How do you want to take cards?
  'setup.cards.title': 'How do you want to take cards?',
  'setup.cards.stripe.none.title': 'First, connect Stripe',
  'setup.cards.stripe.none.body':
    "Stripe pays your card takings into your bank. It takes about ten minutes. You'll need your bank details and some photo ID.",
  'setup.cards.stripe.none.button': 'Connect Stripe',
  'setup.cards.stripe.pending':
    'Stripe is checking your details. This can take up to two working days. You can carry on, and take cash in the meantime.',
  'setup.cards.stripe.done': 'Stripe is connected. Card payments go straight to your own account.',
  'app.setup.cards.stripe.failed': "We couldn't open Stripe. Please try again.",
  'app.setup.cards.stripe.adminOnly': 'Only an admin can connect Stripe.',
  'setup.cards.phone': 'On my phone',
  'setup.cards.phone.note': 'No extra hardware. Clients tap their card, phone or watch on your phone.',
  'setup.cards.reader': 'A counter card reader',
  'setup.cards.reader.note': 'A Stripe reader on your desk. Handy for a busy reception.',
  'setup.cards.both': 'Both',
  'setup.cards.links': 'Payment links only',
  'setup.cards.links.note': 'Send clients a link to pay on their own phone.',
  'setup.cards.inPerson': 'This also lets your team take card payments in the ResNeo app.',
  'app.setup.cards.inPersonFailed': "We couldn't turn on card payments in person. Please try again.",
  'setup.cards.phone.title': 'Get your phone ready',
  // (app) You are on the phone already: this phone gets its own screen, and the team's phones follow.
  'app.setup.cards.thisPhone': 'Check this phone, and set up Tap to Pay on iPhone if you use one.',
  'app.setup.cards.thisPhone.button': 'Get this phone ready',
  'app.setup.cards.team.title': "Your team's phones",
  'app.setup.cards.team.help': 'Your team can take cards on their own phones too. They install the ResNeo app and sign in.',
  'setup.cards.phone.step2.iphone': 'On an iPhone, open More, then Booking settings, and set up Tap to Pay on iPhone. You only do this once.',
  'setup.cards.phone.step2.android': "On Android, you're ready as soon as you've signed in.",
  'setup.cards.phone.waiting': 'Waiting for a phone',
  'setup.cards.phone.ready': "{name}'s {device} is ready to take cards",
  'setup.cards.phone.update': "{name}'s phone needs the latest ResNeo app",
  'setup.cards.phone.devices':
    "Works on iPhone XS or newer, and on Android phones with contactless that run Android 13 or newer. Tap to Pay on iPhone doesn't work on iPad.",
  'app.setup.cards.reader.title': 'Add your card reader',
  'setup.cards.device.iphone': 'iPhone',
  'setup.cards.device.android': 'Android phone',
  'app.setup.cards.device.wisepad': 'card reader',
  'setup.cards.device.other': 'phone',

  // "Get this phone ready" (design 6.6, drawn as C4): the device check, Tap to Pay, the tick.
  'app.setup.phone.title': 'Get this phone ready',
  'app.setup.phone.ok.iphone': 'This iPhone can take cards',
  'app.setup.phone.ok.android': 'This phone runs Android 13 or newer. It can take cards if it has contactless (NFC).',
  'app.setup.phone.no.iphone': "This iPhone can't take cards. Tap to Pay on iPhone needs an iPhone XS or newer.",
  'app.setup.phone.no.ipad': "Tap to Pay on iPhone doesn't work on iPad. Use an iPhone or an Android phone instead.",
  'app.setup.phone.no.android': "This phone can't take cards. It needs Android 13 or newer, with contactless (NFC).",
  'app.setup.phone.no.other': 'Open the ResNeo app on an iPhone or an Android phone to take cards.',
  'app.setup.phone.notifications.on': 'Notifications are on',
  'app.setup.phone.notifications.off': 'Notifications are off. Turn them on so a sale from your desk can reach this phone.',
  'app.setup.phone.notifications.turnOn': 'Turn on notifications',
  'app.setup.phone.notifications.settings': 'Open Settings',
  'app.setup.phone.notifications.denied': 'Notifications are blocked for ResNeo. Turn them on in your phone settings.',
  'app.setup.phone.ttp.ready': 'Tap to Pay on iPhone is set up',
  'app.setup.phone.ttp.todo': "Tap to Pay on iPhone isn't set up yet",
  'app.setup.phone.ttp.once': 'You only do this once. After that, your team can take cards on their own iPhones too.',
  'app.setup.phone.ready': 'This phone is ready to take cards',
  'app.setup.phone.waiting': 'Waiting for this phone to check in. It can take a minute.',
  'app.setup.phone.inPersonOff': "Card payments in person are switched off, so this phone can't take cards yet.",
  'app.setup.phone.inPersonOn': 'Turn on card payments in person',
  'app.setup.phone.inPersonAdmin': 'Ask an admin to turn on card payments in person.',
  'app.setup.phone.devices': 'Works on iPhone XS or newer, and on Android phones with contactless that run Android 13 or newer.',
  'app.setup.phone.done': 'Done',

  // W4. Do your clients leave tips?
  'setup.tips.title': 'Do your clients leave tips?',
  'setup.tips.yes': 'Yes',
  'setup.tips.no': 'No',
  'setup.tips.unsure': 'Not sure yet',
  // The web says "in Settings, Checkout".
  'app.setup.tips.unsure.note': "We'll leave tips off. You can turn them on later in Checkout settings.",
  'setup.tips.share.title': 'How should tips be shared?',
  'setup.tips.share.pro_rata': 'Between the people who did the services, by how much each did (recommended)',
  'setup.tips.share.equal': 'Equally between the people who did the services',
  'setup.tips.share.operator': 'All to the person who took the payment',
  'setup.tips.share.solo': 'Tips go to you.',
  'setup.tips.note': 'Tips go to your team in full. ResNeo never takes a cut, and keeps a record of who got each one.',
  'setup.tips.suggest': "We'll suggest 10%, 15% and 20%, or £1, £2 and £3 on bills under £10. You can change them any time.",
  'setup.tips.policy': 'Add a tipping policy from our template',
  'setup.tips.policy.note': 'You can read it and change it later.',
  'app.setup.tips.policy.exists': 'You already have a tipping policy. You can read it and change it in Checkout settings.',

  // W5. Your details for receipts (OB5: the receipt follows the business profile).
  'setup.biz.title': 'Your details for receipts',
  'app.setup.biz.help': 'Your receipts use the details from your business profile. Check they look right.',
  'app.setup.biz.name': 'Business name',
  'setup.biz.address': 'Address',
  'app.setup.biz.street': 'Street',
  'app.setup.biz.town': 'Town or city',
  'app.setup.biz.postcode': 'Postcode',
  'setup.biz.email': 'Email for clients',
  'setup.biz.phone': 'Phone for clients',
  'setup.biz.profileNote': 'This also changes your booking page.',
  'app.setup.biz.profileAdminOnly': 'These come from your business profile. Only an admin can change them.',
  'setup.biz.name.required': 'Enter your business name.',
  'app.setup.biz.emailInvalid': 'Enter a valid email address.',
  'app.setup.biz.receiptOnly': 'Show different details on receipts',
  'app.setup.biz.receiptOnly.help':
    "Only if your receipts need something different from your booking page. Leave a box empty to use your profile's.",
  'app.setup.biz.receiptOnly.name': 'Name on receipts',
  'app.setup.biz.receiptOnly.line1': 'Address line 1 on receipts',
  'app.setup.biz.receiptOnly.line2': 'Address line 2 on receipts',
  'app.setup.biz.receiptOnly.town': 'Town or city on receipts',
  'app.setup.biz.receiptOnly.postcode': 'Postcode on receipts',
  'app.setup.biz.receiptOnly.email': 'Email on receipts',
  'app.setup.biz.receiptOnly.phone': 'Phone on receipts',
  'app.setup.biz.saved': 'Business details saved.',
  'app.setup.biz.title': 'Your business details',
  'setup.biz.legal': 'Legal name (optional)',
  'setup.biz.legal.help':
    "Your company's registered name, or your own name if you're a sole trader. It goes on VAT receipts and your online shop.",
  'setup.biz.vat.title': 'Are you VAT registered?',
  'setup.biz.vat.no': 'No',
  'setup.biz.vat.yes': 'Yes',
  'setup.biz.vat.number': 'VAT number',
  'setup.biz.vat.number.help': 'Enter it exactly as it appears on your VAT registration.',
  'setup.biz.vat.services': 'VAT on services',
  'setup.biz.vat.products': 'VAT on products',
  'setup.biz.vat.help': 'Not sure which rate applies? Ask your accountant. You can set a different rate on any product.',
  'setup.biz.receipts.title': 'Sending receipts',
  'setup.biz.receipts.auto': "Email a receipt automatically when we have the client's email (recommended)",
  'setup.biz.receipts.ask': 'Ask each time',
  'setup.biz.receipts.footer': 'A message at the bottom of receipts (optional)',
  'setup.biz.receipts.footer.placeholder': 'Thank you for coming in. See you next time!',
  'setup.biz.preview': 'Preview a receipt',
  'setup.practice.receipt': "This is what your client's receipt looks like.",
  'setup.biz.preview.error': "We couldn't show the preview. Please try again.",
  'app.setup.biz.preview.close': 'Close',

  // W6. Your team at the till.
  'setup.team.title': 'Your team at the till',
  'setup.team.help': 'Owners and admins can always do everything. Choose what everyone else can do.',
  'setup.team.team': 'Team member (recommended)',
  'setup.team.team.note': 'Can check clients out, take payments, give discounts up to your limit and see their own sales.',
  'setup.team.frontDesk': 'Front desk',
  'setup.team.frontDesk.note': 'Everything a team member can do, plus refunds, price changes, gift vouchers and loyalty cards.',
  'setup.team.limit': 'Most a team member can take off a sale: {limit}%',
  'setup.team.commission.title': 'Do you pay your team commission?',
  'setup.team.commission.no': 'No',
  'setup.team.commission.yes': 'Yes',
  'setup.team.commission.services': 'On services',
  'setup.team.commission.products': 'On products',
  'setup.team.commission.note':
    "Gift vouchers earn nothing when they're sold. The services and products they pay for earn as normal. You can set rates for each person later.",
  'setup.team.commission.invalid': 'Enter a rate between 0% and 100%.',

  // W7. Add your products.
  'setup.products.title': 'Add your products',
  'setup.products.help': "Add what you sell now, or come back to it. You can sell a product at the till as soon as it's added.",
  'setup.products.quick': 'Add a few now',
  'setup.products.quick.name': 'Name',
  'setup.products.quick.option': 'Size or shade (optional)',
  'setup.products.quick.price': 'Price',
  'setup.products.quick.add': 'Add another',
  'setup.products.quick.save': 'Add {count} products',
  'setup.products.quick.save.one': 'Add 1 product',
  'setup.products.quick.remove': 'Remove row {row}',
  'setup.products.quick.added': '{count} products added. You can sell them at the till now.',
  'setup.products.quick.added.one': '1 product added. You can sell it at the till now.',
  'setup.products.quick.badPrice': 'Enter a price, like 12.50.',
  'setup.products.quick.needName': 'Give the product a name.',
  // While the online shop is on, the products added here go in it too (owner, 2026-10-17).
  'setup.products.quick.online': 'Sell these in my online shop too',
  'setup.products.quick.online.note': 'You can change this for each product later.',
  'app.setup.products.quick.partFailed': 'We added {added} of {count}. {error}',
  'app.setup.products.count': 'You have {count} products.',
  'app.setup.products.count.one': 'You have 1 product.',
  'setup.products.import': 'Import a spreadsheet',
  // The web's import opens a page with its template; the app has the same import, on the phone.
  'app.setup.products.import.body':
    "Use a spreadsheet you already have, saved as a CSV file. You'll match the columns, check every row, then import.",
  'app.setup.products.import.button': 'Import from a CSV file',
  'setup.products.ai': 'Photograph your shelves or a price list',
  'setup.products.ai.body': "We'll read the products and prices for you to check.",
  'setup.products.later': "I'll add products later",
  'setup.products.stock.title': 'Do you want ResNeo to count your stock?',
  'setup.products.stock.body':
    "We'll take items off as you sell them and tell you when you're running low. You'll count what you have in a stocktake first.",
  'setup.products.stock.yes': 'Yes, count my stock',
  'setup.products.stock.no': 'Not now',

  // W8. Set up gift vouchers.
  'setup.vch.title': 'Set up gift vouchers',
  'setup.vch.amounts': 'Amounts to offer',
  'setup.vch.amounts.add': 'Add an amount',
  'app.setup.vch.amount.new': 'Another amount',
  'setup.vch.amounts.remove': 'Remove {amount}',
  'setup.vch.custom': 'Let buyers choose another amount between {min} and {max}',
  'setup.vch.expiry.title': 'How long do they last?',
  'setup.vch.expiry.12': '12 months (recommended)',
  'setup.vch.expiry.other': 'Another length',
  'setup.vch.expiry.none': 'They never run out',
  'setup.vch.expiry.months': 'Months',
  'setup.vch.expiry.months.invalid': 'Enter how many months they last, like 12.',
  'setup.vch.terms': 'Use our voucher terms',
  'setup.vch.terms.note': 'You can read them and change them later.',
  'setup.vch.online.title': 'Sell them online too?',
  'setup.vch.online.yes': 'Yes, on my booking page and my own voucher page',
  'setup.vch.online.later': 'Not yet',
  'setup.vch.online.needs': "You'll need Stripe connected to sell online.",
  // The web says "from Settings, Checkout"; the app has the same in Gift voucher settings.
  'app.setup.vch.existing': 'Already sold paper vouchers? You can add them, or import a list, in Gift voucher settings.',
  'setup.vch.collective':
    "Your booking page hands over to the {collective} page. While you sell vouchers online, its Gift vouchers tab links to your voucher page. You can share your own link too: {link}",

  // W9. Set up your loyalty card.
  'setup.loy.title': 'Set up your loyalty card',
  'setup.loy.stamps': 'How many visits fill a card?',
  'setup.loy.reward.title': "What's the reward?",
  'setup.loy.reward.free': 'A free service',
  'setup.loy.reward.amount': 'Money off',
  'setup.loy.reward.percent': 'Percentage off',
  'setup.loy.reward.service': 'Which service?',
  'setup.loy.reward.amountLabel': 'How much off',
  'setup.loy.reward.percentLabel': 'Percentage off the visit',
  'app.setup.loy.reward.chooseService': 'Choose the free service.',
  'app.setup.loy.reward.amountInvalid': 'Enter the amount off, like 10.',
  'app.setup.loy.reward.percentInvalid': 'Enter a percentage between 1 and 100.',
  'setup.loy.services.title': 'Which visits count?',
  'setup.loy.services.all': 'Every service (recommended)',
  'setup.loy.services.some': 'Only some services',
  'app.setup.loy.services.none': 'Choose at least one service.',
  'setup.loy.start':
    "Your card starts today. Visits before today don't count. You can add stamps by hand for clients with a paper card.",
  'setup.loy.preview': 'This is how clients will see it.',
  'app.setup.loy.visits': '{count} visits',

  // W10. Your online shop.
  'setup.shop.title': 'Your online shop',
  'setup.shop.body': 'Your shop opens when these are done. You can do them now or later.',
  'setup.shop.ready': 'Everything is ready for your shop to open.',
  'setup.shop.go': 'Set up my shop',
  'setup.shop.collective':
    "Your booking page hands over to the {collective} page. Once your shop is open, its Shop tab links to it. You can share your own link too: {link}",
  'app.setup.shop.open': 'Your shop is open.',
  // Opening the shop from set-up, or where to open it later (owner, 2026-10-17). The web names
  // "Settings, Checkout, Online shop"; the app's place is Checkout settings, Online shop.
  'setup.shop.templates': "Use our templates for your shop's policies",
  'app.setup.shop.templates.note':
    "We'll fill in the ones you haven't written, with your details. They're a starting point: read them in Checkout settings, Online shop, and change anything that doesn't fit how you work.",
  'setup.shop.open.title': 'Open your shop now?',
  'setup.shop.open.yes': 'Yes, open my shop',
  'setup.shop.open.yes.note': 'Customers can order from your shop as soon as you continue.',
  'setup.shop.open.yes.notReady': 'You can choose this once everything above is ticked.',
  'setup.shop.open.no': 'Not yet',
  'app.setup.shop.open.no.note': 'You can open your shop any time in Checkout settings, Online shop.',

  // W11. Try a practice sale (the sale screen's practice mode is its own builder's).
  'setup.practice.title': 'Try a practice sale',
  'setup.practice.body':
    'Get the feel of Checkout with a practice sale. Nothing is real: no money moves, no stock changes and nobody gets a message.',
  'setup.practice.start': 'Start a practice sale',
  'setup.practice.skip': 'Skip',
  'setup.practice.finished': "That's it. Your practice sale has been cleared away.",

  // W12. Checkout is ready.
  'setup.done.title': 'Checkout is ready',
  'setup.done.summary': "Here's what's set up:",
  'setup.done.todo': 'Still to do:',
  'setup.done.first.title': 'Your first real sale',
  'setup.done.first.booking': 'Open the appointment in your calendar and choose Check out.',
  // The web's list is "Ready to check out"; the app's tab says "Ready to pay".
  'app.setup.done.first.queue': "Or mark the client as Arrived. They'll wait for you in Ready to pay.",
  'setup.done.first.walkIn': 'Someone just buying a product? Choose New sale.',
  'setup.done.team': 'Ask your team to update the ResNeo app and sign in.',
  'setup.done.open': 'Open Checkout',
  // The web says "Back to Home"; the app goes back to wherever set-up was opened from.
  'app.setup.done.close': 'Done',
  // What is set up, the web's lines (`summaryLines` in lib/pos/setup/summary.ts).
  'setup.done.line.cards.phone': "Cards on {name}'s {device}",
  'setup.done.line.cards.reader': 'Cards on your card reader',
  'setup.done.line.cards.inPerson': 'Cards in person',
  'setup.done.line.cards.links': 'Cards by payment link',
  'setup.done.line.cards.other': 'Cards on your other card machine',
  'setup.done.line.cash': 'Cash',
  'setup.done.line.cash.count': 'Cash, counted at the end of the day',
  'setup.done.line.tips.pro_rata_services': 'Tips, shared by how much each person did',
  'setup.done.line.tips.equal_performers': 'Tips, shared equally',
  'setup.done.line.tips.operator': 'Tips, to the person who takes the payment',
  'setup.done.line.tips.manual': 'Tips, shared at each sale',
  'setup.done.line.tips.off': 'No tips for now',
  'setup.done.line.details': 'Your receipt details',
  'setup.done.line.team': 'What your team can do',
  'setup.done.line.products': 'Your products',
  'setup.done.line.vouchers': 'Gift vouchers',
  'setup.done.line.loyalty': 'Your loyalty card',
  'setup.done.line.shop': 'Your online shop',
  'setup.done.line.practice': 'A practice sale',

  // The set-up card (design 6.6, drawn as B15 and C3): Today and the top of Checkout settings.
  'setup.card.title': 'Finish setting up Checkout',
  'setup.card.progress': '{done} of {total} done',
  'setup.card.continue': 'Continue',
  'setup.card.hide': 'Hide',
  'setup.card.skipped': 'Skipped',
  'setup.card.step.cards': 'Take cards on your phone',
  'setup.card.step.tips': 'Decide about tips',
  'setup.card.step.details': 'Check your receipt details',
  'setup.card.step.team': 'Choose what your team can do',
  'setup.card.step.products': 'Add your products',
  'setup.card.step.vouchers': 'Set up gift vouchers',
  'setup.card.step.loyalty': 'Set up your loyalty card',
  'setup.card.step.shop': 'Open your online shop',
  'setup.card.step.practice': 'Try a practice sale',
  'app.setup.card.hidden': 'Hidden. You can finish setting up any time from Checkout settings.',
  'setup.card.hideFailed': "We couldn't hide this. Please try again.",
  'setup.again': 'Run set-up again',
} as const;

export type SetupCopyId = keyof typeof SETUP_COPY;

/** One string from the deck, filled. A count of one uses the `<id>.one` wording when there is one. */
export function setupT(id: SetupCopyId, vars: CopyVars = {}): string {
  const one = `${id}.one`;
  if (Number(vars.count) === 1 && one in SETUP_COPY) return fillCopy(SETUP_COPY[one as SetupCopyId], vars);
  return fillCopy(SETUP_COPY[id], vars);
}

/** The set-up card's line for a step ("Add your products"). */
export function stepCardLabel(id: PosSetupStepId): string {
  return SETUP_COPY[`setup.card.step.${id}`];
}
