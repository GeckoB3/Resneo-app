import { pluralVenueTerm } from '@/lib/venue/calendar-upcoming-bookings';

/**
 * Checkout settings words in the app, keyed by the web's ids and copied word for word from the web
 * (`src/app/dashboard/settings/checkout/copy.ts`, the cash words from `src/lib/pos/till/copy.ts`,
 * the Track stock choice from `src/components/retail/copy.ts`, the permissions grid from
 * `capability-groups.ts`). The app's own strings follow under `app.set.*`.
 *
 * `{client}`, `{clients}` and `{Clients}` are the venue's own word for its clients. No em-dashes
 * anywhere (`settings-copy.test.ts` checks).
 */

export interface ClientWords {
  client: string;
  clients: string;
  Clients: string;
}

export function clientWords(clientWord: string | null | undefined): ClientWords {
  const client = (clientWord ?? '').trim().toLowerCase() || 'client';
  const clients = pluralVenueTerm(client, 'client');
  return { client, clients, Clients: clients.charAt(0).toUpperCase() + clients.slice(1) };
}

export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key]! : m));
}

export const SETTINGS_COPY = {
  'common.save': 'Save changes',
  'common.cancel': 'Cancel',
  'common.saveError': "We couldn't save that. Please try again.",
  'common.networkError': "We couldn't reach ResNeo. Check your connection and try again.",
  'common.discard': 'Discard changes',
  'common.useTheirs': 'Use their changes',
  'common.loading': 'Loading...',
  'common.unsaved': "You have changes that aren't saved. Leave without saving?",
  'common.leave': 'Leave without saving',
  'common.stay': 'Keep editing',
  'err.POS_SETTINGS_STALE':
    "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.",
  'err.nameTaken': 'You already have one called {name}. Choose a different name.',
  'err.unavailable': "Checkout isn't available for your business right now.",

  'feat.title': 'Features',
  'feat.help': 'Checkout starts simple. Turn on only what you need, and change it whenever you like.',
  'feat.stock': 'Track stock',
  'feat.stock.help': 'Count how many of each product you have, take them off as you sell, get low-stock alerts and do stocktakes.',
  'feat.cash': 'Count cash in till sessions',
  'feat.cash.help': 'Open the till with a float, record cash in and out, and count up at the end of the day.',
  'feat.tills': 'Use more than one till',
  'feat.tills.help': 'For businesses that take money in more than one place, each with its own cash drawer.',
  'feat.on.done': '{feature} is on.',
  'feat.off.title': 'Turn off {feature}?',
  'feat.off.body': 'Nothing is deleted. If you turn it back on later, everything will be as you left it.',
  'feat.off.confirm': 'Turn off',
  'feat.tills.on.title': 'Add another till?',
  'feat.tills.on.body': "This turns on Use more than one till, so each device can choose which till it's at.",
  'feat.stock.on.title': 'Start tracking stock?',
  'feat.stock.on.body':
    "Your products don't have stock counts yet. Choose where to start. A stocktake is the quickest way to get your counts right.",
  'feat.stock.on.all': 'Track all my products, starting at zero',
  'feat.stock.on.new': 'Only products I add from now on',

  'set.biz.title': 'Business and tax details',
  'set.biz.help': 'Shown on receipts, VAT invoices and your online shop. Check them with your accountant.',
  'set.biz.saved': 'Business and tax details saved.',
  'set.biz.legalName': 'Legal name',
  'set.biz.legalName.help': "Your company's registered name, or your own name if you're a sole trader.",
  'set.biz.tradingName': 'Trading name',
  'set.biz.tradingName.help': "The name your {clients} know you by, if it's different.",
  'set.biz.companyNumber': 'Company number',
  'set.biz.companyNumber.help': "If you're a limited company.",
  'set.biz.address': 'Business address',
  'set.biz.address.line1': 'Address line 1',
  'set.biz.address.line2': 'Address line 2',
  'set.biz.address.town': 'Town or city',
  'set.biz.address.postcode': 'Postcode',
  'set.biz.country': 'Country',
  'set.biz.country.help': 'Set from your Stripe account.',
  'set.biz.country.gb': 'United Kingdom',
  'set.biz.country.ie': 'Ireland',
  'set.biz.registeredOffice': 'Registered office',
  'set.biz.registeredOffice.help':
    "For limited companies: the address on your company registration. It's shown in your shop.",
  'set.biz.registeredOffice.same': 'Same as the business address',
  'set.biz.registeredIn': 'Where the company is registered',
  'set.biz.registeredIn.choose': 'Choose one',
  'set.biz.registeredIn.ew': 'England and Wales',
  'set.biz.registeredIn.scotland': 'Scotland',
  'set.biz.registeredIn.ni': 'Northern Ireland',
  'set.biz.email': 'Public contact email',
  'set.biz.email.help': "Customers can contact you on this address. It's shown on receipts and in your shop.",
  'set.biz.phone': 'Public phone number',
  'set.biz.phone.help': 'Customers can call you on this number. The law asks online shops to show one.',
  'set.biz.vatRegistered': "We're VAT registered",
  'set.biz.vatNumber': 'VAT number',
  'set.biz.serviceRate': 'VAT rate for services',
  'set.biz.productRate': 'VAT rate for products',
  'set.biz.pricesInclude': 'Your prices always include VAT.',
  'set.biz.accountant': 'Not sure which rate applies? Ask your accountant. You can set a different rate on any product.',
  'vat.rate.standard': 'Standard (20%)',
  'vat.rate.reduced': 'Reduced (5%)',
  'vat.rate.zero': 'Zero (0%)',
  'vat.rate.exempt': 'Exempt',

  'set.rcpt.title': 'Receipts',
  'set.rcpt.saved': 'Receipt settings saved.',
  'set.rcpt.prefix': 'Receipt number prefix',
  'set.rcpt.prefix.help': 'Optional, up to 8 characters. For example, R- makes receipt numbers like R-1042.',
  'set.rcpt.footer': 'Message at the bottom of receipts',
  'set.rcpt.footer.help': 'Up to 500 characters. For example, a thank you or your social media name.',
  'set.rcpt.auto': 'When a sale is paid',
  'set.rcpt.auto.ask': 'Ask each time',
  'set.rcpt.auto.email_if_known': 'Email it automatically when we have their email',
  'set.rcpt.auto.never': "Don't send one automatically",

  'set.tips.title': 'Tips',
  'set.tips.saved': 'Tip settings saved.',
  'set.tips.help': 'Tips never count as sales and never have VAT. We keep a record of who gets each one.',
  'set.tips.enabled': 'Take tips',
  'set.tips.mode': 'Tips rules',
  'set.tips.mode.all':
    'Tips go to your team in full. ResNeo keeps a record of who got each tip, so you have the records you need.',
  'set.tips.presets': 'Percentages to suggest (whole numbers)',
  'set.tips.percent.n': 'Percentage {n}',
  'set.tips.amounts': 'Amounts to suggest on smaller bills',
  'set.tips.amount.n': 'Amount {n}',
  'set.tips.smart': 'When the bill is under {amount}, suggest amounts instead',
  'set.tips.custom': 'Let {clients} choose another amount',
  'set.tips.base': 'Work percentages out on',
  'set.tips.base.services': 'Services only (recommended)',
  'set.tips.base.total': 'The whole bill',
  'set.tips.rule': 'Share tips',
  'set.tips.rule.pro_rata_services': "In proportion to the value of each person's services (recommended)",
  'set.tips.rule.equal_performers': 'Equally between the people who did the services',
  'set.tips.rule.operator': 'All to the person who took the payment',
  'set.tips.rule.manual': 'Choose at each sale',
  'set.tips.policy': 'Your tipping policy',
  'set.tips.policy.help':
    'Optional. A written policy that explains how tips are shared is good practice, and the law may ask for one if your team gets tips regularly. Your team sees it in the till and on their Account page.',
  'set.tips.policy.template': 'Start from our template',
  'set.tips.policy.replace.title': 'Replace your tipping policy?',
  'set.tips.policy.replace.body': 'This replaces the text you have now with our template. You can edit it before you save.',
  'set.tips.policy.replace.confirm': 'Use the template',
  'set.tips.policy.rule.pro_rata_services':
    "Each tip is shared between the people who did the services, in proportion to the value of each person's services.",
  'set.tips.policy.rule.equal_performers': 'Each tip is shared equally between the people who did the services.',
  'set.tips.policy.rule.operator': 'Each tip goes to the person who took the payment.',
  'set.tips.policy.rule.manual': "We agree how each tip is shared when it's paid, and record who got what.",

  'set.disc.title': 'Discounts and reasons',
  'set.disc.saved': 'Discounts and reasons saved.',
  'set.disc.limit': 'Team discount limit',
  'set.disc.limit.help':
    "Team members can give discounts up to this much in total on a sale. Offers, tag discounts and promotion codes don't count towards it. Above it, an admin gives the discount on their own login. Admins have no limit.",
  'set.disc.reasonRequired': 'Ask for a reason for every discount',
  'set.disc.reasons': 'Reasons to choose from',
  'set.disc.reasons.add': 'Add a reason',
  'set.disc.freeText': 'Let team members type their own reason',
  'set.disc.presets': 'Preset discounts',
  'set.disc.presets.empty': 'No preset discounts yet. Add one for discounts you give often.',
  'set.disc.preset.add': 'Add a preset',
  'set.disc.preset.edit': 'Edit',
  'set.disc.preset.name': 'Name',
  'set.disc.preset.value': 'Discount',
  'set.disc.preset.kind.percent': 'A percentage',
  'set.disc.preset.kind.amount': 'An amount',
  'set.disc.preset.percentOff': 'Percentage off',
  'set.disc.preset.amountOff': 'Amount off',
  'set.disc.preset.appliesTo': 'Applies to',
  'set.disc.appliesTo.all': 'Everything',
  'set.disc.appliesTo.services': 'Services',
  'set.disc.appliesTo.products': 'Products',
  'set.disc.preset.max': 'Most it can take off (optional)',
  'set.disc.preset.reasonRequired': 'Ask for a reason',
  'set.disc.preset.active': 'Show at the till',
  'set.disc.preset.hidden': 'Hidden at the till',
  'set.disc.preset.archive': 'Archive preset',
  'set.disc.preset.archive.body': '{name} stops showing at the till. Sales that used it keep it.',
  'set.disc.preset.saved': 'Preset saved.',
  'set.disc.preset.archived': 'Preset archived.',
  'set.disc.preset.percentDesc': '{value}% off',
  'set.disc.preset.amountDesc': '{value} off',
  'set.reasons.refund': 'Refund reasons',
  'set.reasons.void': 'Reasons for voiding a sale',
  'set.reasons.add': 'Add a reason',
  'set.reasons.remove': 'Remove {reason}',

  'set.ptypes.title': 'Other payment types',
  'set.ptypes.help':
    'For money you take outside ResNeo. Each type shows as its own line in your takings. Matching them to your bank statement is up to you.',
  'set.ptypes.name': 'Name',
  'set.ptypes.ref': 'Ask for a reference',
  'set.ptypes.active': 'Show at the till',
  'set.ptypes.add': 'Add a payment type',
  'set.ptypes.suggest': 'Most venues start with these:',
  'set.ptypes.rename': 'Rename',
  'set.ptypes.rename.title': 'Rename payment type',
  'set.ptypes.remove': 'Remove',
  'set.ptypes.remove.title': 'Remove {name}?',
  'set.ptypes.remove.body':
    'It stops showing at the till. If any payments were taken as {name}, it is switched off instead, so your takings keep its name.',
  'set.ptypes.moveUp': 'Move {name} up',
  'set.ptypes.moveDown': 'Move {name} down',
  'set.ptypes.saved': 'Payment type saved.',
  'set.ptypes.added': '{name} added.',
  'set.ptypes.removed': '{name} removed.',
  'set.ptypes.switchedOff': '{name} is switched off.',
  'set.ptypes.orderSaved': 'Order saved.',

  'set.caps.presets.title': 'Who can do what',
  'set.caps.presets.help':
    'Choose what your team can do in Checkout. This applies to everyone with a team member login.',
  'set.caps.preset.owner': 'Owner and admins',
  'set.caps.preset.owner.body': 'Can always do everything. You make someone an admin in Settings, Staff.',
  'set.caps.preset.frontDesk': 'Front desk',
  'set.caps.preset.frontDesk.body':
    'Can check out and take payments, give refunds, change prices, charge cards on file, look after gift vouchers and loyalty cards, and adjust stock.',
  'set.caps.preset.team': 'Team member',
  'set.caps.preset.team.body':
    "Can check out and take payments, give discounts up to your limit, and see their own sales. Can't give refunds or change prices.",
  'set.caps.preset.custom': 'Your own mix. See Advanced.',
  'set.caps.preset.confirm.title': 'Use the {preset} permissions?',
  'set.caps.preset.confirm.body':
    'Everyone with a team member login will be able to do what this allows. You can fine-tune it under Advanced.',
  'set.caps.preset.confirm.label': 'Use {preset}',
  'set.caps.preset.saved': '{preset} permissions saved.',
  'set.caps.advanced': 'Advanced',
  'set.caps.title': 'Team permissions',
  'set.caps.help': 'Choose what team members can do in Checkout. Admins can always do everything.',
  'set.caps.sharedDevice':
    'These limits follow the login a device is signed in with. A device signed in as an admin can do everything, whoever is serving.',
  'set.caps.alwaysAdmin':
    'Refunds to a different method from the original payment, and free replacements for lost orders, always need an admin.',
  'set.caps.reset': 'Use the standard permissions',
  'set.caps.reset.title': 'Go back to the standard permissions?',
  'set.caps.reset.body': 'Every switch here goes back to how ResNeo sets it up.',
  'set.caps.reset.saved': 'Standard permissions saved.',
  'set.caps.saved': 'Team permissions saved.',
  'set.caps.upTo': '{label} (up to {percent}%)',

  'set.tills.title': 'Tills',
  'set.tills.help': 'A till is a place you take money, usually with a cash drawer. Most venues need one.',
  'set.tills.drawer': 'Has a cash drawer',
  'set.tills.active': 'In use',
  'set.tills.notInUse': 'Not in use',
  'set.tills.add': 'Add a till',
  'set.tills.name': 'Name',
  'set.tills.single': 'You have one till, {till}. Add another if you take money in more than one place.',
  'set.tills.singleDefault': 'Front desk',
  'set.tills.addAnother': 'Add another till',
  'set.tills.rename': 'Rename',
  'set.tills.rename.title': 'Rename till',
  'set.tills.saved': 'Till saved.',
  'set.tills.added': '{name} added.',
  'set.tills.remove': 'Remove',
  'set.tills.remove.title': 'Remove {name}?',
  'set.tills.remove.body':
    "If any sales, payments or till sessions used {name}, it's taken out of use instead, so your records keep its name.",
  'set.tills.removed': '{name} removed.',
  'set.tills.switchedOff': '{name} is no longer in use.',

  'set.cash.title': 'Cash',
  'set.cash.saved': 'Cash settings saved.',
  'set.cash.enabled.help':
    'Open the till with a float each morning and count it at close. Leave this off if you rarely take cash.',
  'set.cash.blind': 'Blind counts',
  'set.cash.blind.help':
    "When this is on, nobody sees the expected amount until they've counted. It's the best way to catch mistakes. People you let see expected cash still see it after the count.",
  'set.cash.threshold': 'Ask for a reason when the count is out by more than',
  'set.cash.float': 'Usual float',
  'set.cash.legacyTill': 'Till for cash from older app versions',
  'set.cash.legacyTill.help':
    "Cash taken in older versions of the ResNeo app, and deposits recorded as cash at the desk, count into this till's open session.",
  'set.cash.legacyTill.ask':
    'Before you turn this on, choose which till counts cash taken in older versions of the ResNeo app.',
  'set.cash.legacyTill.none': 'The only open till',
  'set.cash.max': 'Largest single payment',
  'set.cash.max.help': 'Stops typing mistakes, like an extra zero. It applies to every way of paying.',

  // The app's own words: the hub and its rows.
  'app.set.title': 'Checkout settings',
  'app.set.intro': 'Your till, receipts, tips, discounts, card readers, cash and online shop.',
  'app.set.noAccess.title': 'Admins only',
  'app.set.noAccess.body':
    'Only admins, and team members allowed to change checkout settings, can open Checkout settings.',
  'app.set.adminOnly.title': 'Admins only',
  'app.set.adminOnly.body': 'Only an admin can change this.',
  'app.set.error.title': "We couldn't load your checkout settings",
  'app.set.row.features': 'Track stock, cash and tills',
  'app.set.row.business': 'Legal name, address, VAT',
  'app.set.row.receipts': 'Number prefix, message, sending',
  'app.set.row.tips': 'Suggestions, sharing, policy',
  'app.set.row.discounts': 'Team limit, reasons, presets',
  'app.set.row.paymentTypes': 'Money you take outside ResNeo',
  'app.set.row.cardsOnFile': 'Save cards when {clients} agree',
  'app.set.row.vouchers': 'Amounts, expiry, selling online',
  'app.set.row.loyalty': 'Stamps and rewards',
  'app.set.row.commission': 'What your team earns',
  'app.set.row.permissions': 'What your team can do',
  'app.set.row.tills': 'Where you take money',
  'app.set.row.readers': 'Counter card readers',
  'app.set.row.cash': 'Floats, counts, largest payment',
  'app.set.row.stock': 'Selling past zero, low-stock email',
  'app.set.row.shop': 'Your online shop',
  'app.set.title.cardsOnFile': 'Cards on file',
  'app.set.title.vouchers': 'Gift vouchers',
  'app.set.title.loyalty': 'Loyalty card',
  'app.set.title.commission': 'Commission',
  'app.set.title.readers': 'Card readers',
  'app.set.title.stock': 'Stock',
  'app.set.title.shop': 'Online shop',
} as const;

export type SettingsCopyId = keyof typeof SETTINGS_COPY;
export type SettingsT = (id: SettingsCopyId, values?: Record<string, string>) => string;

/** Copy with the venue's client words filled in (callers' own values win). */
export function settingsCopyFor(words: ClientWords): SettingsT {
  return (id, values = {}) =>
    fill(SETTINGS_COPY[id], { client: words.client, clients: words.clients, Clients: words.Clients, ...values });
}

/** The tipping policy template (`set.tips.policy.templateText`), filled for the venue and rule. */
export function tippingPolicyTemplate(venue: string, client: string, ruleSentence: string): string {
  return [
    `Tipping policy at ${venue}`,
    `Tips are always optional. When a ${client} leaves a tip, by card, on a pay link or in cash, it goes to the team in full. We don't take anything out of tips, including card processing fees.`,
    `How tips are shared: ${ruleSentence} Tips on product-only sales go to whoever sold the products.`,
    'Tips are paid through payroll. Cash tips taken from the till are recorded against each person.',
    "We keep a record of every tip received and who it went to for at least three years. You can ask in writing for the record of your own tips, and we'll give it to you within four weeks.",
    'If you have a question about tips, please ask the owner or manager.',
  ].join('\n\n');
}
