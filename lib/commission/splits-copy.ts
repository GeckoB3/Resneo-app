/**
 * Commission splits, word for word from the web's copy deck `SPLITS_COPY`
 * (src/lib/commission/copy.ts, reports/Commission splits across linked venues.md). Only the strings
 * the app shows are here; the notice and email wording stays on the web. The team rate wording that
 * already existed stays in `lib/pos/settings-more/commission-copy.ts` (`set.comm.*`) and
 * `lib/pos/reports-copy.ts` (`rep.c.*`). The few app-only lines are marked (app) and start `app.`.
 *
 * House rules (CLAUDE.md): no em-dashes, plain second person, straight apostrophes.
 */
export const SPLITS_COPY = {
  // Settings page
  'page.title': 'Commission splits',
  'page.tab.description': 'Commission for your team, and shares agreed with businesses you work with',
  'page.intro':
    'Decide who earns a share of what each calendar takes. ResNeo works out what is owed. Paying it is up to you.',
  'page.setUp': 'Set up a split',
  'page.seeReport': 'See what is owed in Reports',
  'page.helpLink': 'How commission splits work',

  // The calendar-first page (Settings and the app's Commission splits screen)
  'answer.title': 'Waiting for your answer',
  'answer.help': 'Nothing counts until you accept.',
  'answer.details': 'See details',
  'answer.detail': 'Worked out {basis}, from {date}. Settle up {period}.',
  'cal.yours.title': 'Your calendars',
  'cal.yours.help': 'What each calendar earns the person who works it, and any share you have agreed with another business.',
  'cal.yours.empty': 'You have no calendars yet.',
  'cal.theirs.title': 'Calendars at businesses you work with',
  'cal.theirs.help':
    "Agree a share of a calendar's takings with the business it belongs to, such as chair rent. They must accept before anything counts.",
  'cal.theirs.link': '"Work as one team" link',
  'cal.theirs.collective': 'Your collective',
  'cal.theirs.empty':
    'When you link with another business using "Work as one team", or join a collective, their calendars show here so you can agree a share, such as chair rent.',
  'cal.logins.title': 'Logins without a calendar',
  'cal.logins.help':
    "These team logins aren't linked to a calendar, so they only earn from what they sell at Checkout, such as products. To count a login with a calendar, choose its calendars in Staff.",
  'cal.none': 'No split yet.',
  'cal.change': 'Change',
  'cal.setShare': 'Set a share',
  'cal.manage': 'Manage',
  'cal.setUp': 'Set up a split',
  'cal.shareWithBusiness': 'Share with a business',
  'cal.team.pays': 'You pay {name} {what}, {label}.',
  'cal.team.nothing': "You don't pay {name} a share yet.",
  'cal.team.categoriesOnly': 'You pay {name} only on some categories, {label}.',
  'cal.team.standard': 'Standard rates',
  'cal.team.own': 'Own rates',
  'cal.team.except': 'Different for {list}.',
  'cal.team.next': 'From {date}: {what}.',
  'cal.team.nextStandard': 'From {date}: your standard rates.',
  'cal.biz.youPay': 'You pay {partner} {what}, {label}.',
  'cal.biz.theyPay': '{partner} pays you {what}, {label}.',
  'cal.biz.proposedYouPay': 'Proposed: you pay {partner} {what}, {label}.',
  'cal.biz.proposedTheyPay': 'Proposed: {partner} pays you {what}, {label}.',
  'cal.standard.title': 'Standard rates',
  'cal.standard.help': 'What your team earns unless a calendar has its own rates.',
  'cal.standard.precedence':
    "The most specific rate wins: a calendar's own rate for a category, then its own rate, then your standard rate for the category, then your standard rate. With none, it's 0%.",
  'cal.counting.title': 'How figures are worked out',
  'cal.counting.help': 'These apply to the shares you pay your team.',
  'cal.past.title': 'Past splits',
  'cal.past.help': 'Splits that ended, were declined or were withdrawn. Their statements stay here to read.',
  'cal.past.show': 'Show past splits ({count})',
  'cal.past.hide': 'Hide',

  // How a share is described ("as rent")
  'as.rent': 'as rent',
  'as.fee': 'as a fee',
  'as.commission': 'as commission',
  'as.their_share': 'as their share',
  'what.services': '{rate}% of services',
  'what.products': '{rate}% of products',
  'what.vouchers': '{rate}% of gift vouchers',
  'what.and': '{first} and {last}',

  // Set up a split: who
  'setup.title': 'Set up a split',
  'setup.calendar': 'Whose takings are shared?',
  'setup.calendar.help': 'The calendar whose bookings and sales the share comes from.',
  'setup.calendar.yours': 'Your calendars',
  'setup.calendar.theirs': 'At {partner}',
  'setup.calendar.logins': 'Logins without a calendar',
  'setup.calendar.choose': 'Choose a calendar',
  'setup.earner': 'Who earns a share?',
  'setup.earner.person.help': 'You pay them a share of what this calendar takes. For employed or self-employed team members.',
  'setup.earner.login.help': 'You pay them a share of what they sell at Checkout.',
  'setup.earner.partner.help': 'You pay them a share of what this calendar takes, such as rent for a chair. They must accept first.',
  'setup.earner.you': '{venue} (your business)',
  'setup.earner.you.help': '{partner} pays you a share of what this calendar takes, such as rent for a chair. They must accept first.',
  'setup.earner.exists': 'Already set up. Manage it from the list.',
  'setup.earner.now': 'At the moment: {what}.',
  'propose.youPay.help': 'You pay {partner} a share of what this calendar takes, such as rent for a chair. {partner} must accept first.',
  'propose.theyPay.help': '{partner} pays you a share of what this calendar takes, such as rent for a chair. {partner} must accept first.',
  'setup.earner.business': 'A business you work with',
  'setup.next': 'Next',
  'setup.back': 'Back',

  // A person's share
  'share.title': "{name}'s share",
  'share.help': 'What you pay {name} from what this calendar takes.',
  'share.help.login': 'What you pay {name} from what they sell at Checkout.',
  'share.mode': 'Rates',
  'share.mode.standard': 'Use your standard rates',
  'share.mode.own': 'Set their own rates',
  'share.mode.standard.none': 'Your standard rates are 0% at the moment.',
  'share.services': 'Share of services (%)',
  'share.products': 'Share of products (%)',
  'share.products.help': 'Products credited to them at Checkout.',
  'share.label': 'Call it',
  'share.label.help': 'Only changes the word used on reports.',
  'share.start': 'Starts on',
  'share.start.help': 'The first day the new share counts. Days before it keep the rates they had.',
  'share.save': 'Save',
  'share.saved': 'Saved.',
  'share.backdated': 'This starts before today, so figures already worked out from {date} will change.',
  'share.categories': 'Rates for one category',
  'share.categories.help': 'Use these when a category earns a different rate, such as colour.',
  'share.categories.add': 'Add a category rate',
  'share.categories.instant': 'Category rates save as soon as you add or stop them.',
  'share.history': 'Earlier rates',

  // Changing one standard rate
  'rate.title': 'Standard rate for {what}',
  'rate.title.category': 'Add a category rate',
  'rate.label': 'Rate (%)',
  'rate.current': 'At the moment: {rate}%.',
  'rate.summary': 'From {date}, your team earns {rate}% of {what}, unless a calendar has its own rate.',
  'rate.summary.category': 'From {date}, your team earns {rate}% on {what}, unless a calendar has its own rate for it.',
  'rate.type': 'Type',
  'rate.category': 'Category',
  'rate.category.choose': 'Choose a category',
  'sum.team': 'From {date}, you pay {name} {what} on their calendar, {label}.',
  'sum.team.login': 'From {date}, you pay {name} {what} from their sales at Checkout, {label}.',
  'sum.team.nothing': 'From {date}, you pay {name} nothing.',
  'sum.team.example': 'For example, on {base} of services, {name} earns {amount}.',
  'sum.biz.youPay': "From {date}, you pay {partner} {what} on {calendar}'s calendar, worked out {basis}. It counts {label} and you settle up {period}.",
  'sum.biz.theyPay': "From {date}, {partner} pays you {what} on {calendar}'s calendar, worked out {basis}. It counts {label} and you settle up {period}.",
  'sum.biz.accept': 'Nothing counts until {partner} accepts.',
  'sum.period.weekly': 'weekly',
  'sum.period.monthly': 'monthly',

  // Your team
  'team.source.title': 'What counts for services',
  'team.source.auto': 'Automatic',
  'team.source.auto.help': 'Sales checked out at the till while Checkout is on, completed bookings otherwise.',
  'team.source.checkout': 'Sales checked out at the till',
  'team.source.checkout.help': 'What clients paid at Checkout, after discounts and refunds.',
  'team.source.bookings': 'Completed bookings',
  'team.source.bookings.help':
    'Bookings up to today that were not cancelled, a no-show or waiting for payment, at the price they were booked at.',
  'team.source.noCheckout':
    'Services count from completed bookings. Products and gift vouchers count once you sell them at Checkout.',
  'team.source.saved': 'Saved. The report now counts services from {source}.',
  'team.label.saved': 'Saved.',
  'team.basis.none': "VAT isn't set up in ResNeo, so figures use prices as booked.",

  // Labels
  'label.commission': 'Commission',
  'label.their_share': 'Their share',
  'label.rent': 'Rent',
  'label.fee': 'Fee',

  // VAT and periods
  'basis.net_ex_vat': 'Before VAT',
  'basis.net_inc_vat': 'Including VAT',
  'period.weekly': 'Weekly, Monday to Sunday',
  'period.monthly': 'Monthly',
  'period.weekly.short': 'Weekly',
  'period.monthly.short': 'Monthly',

  // Businesses you work with
  'biz.none':
    'Splits need a link where the other business shares its calendar with full detail and booking rights ("Work as one team"), or a live collective you both belong to.',
  'biz.youPay': 'You pay {partner}',
  'biz.theyPay': '{partner} pays you',
  'biz.calendarAt': '{calendar} at {business}',
  'biz.summary.services': '{rate}% of services',
  'biz.summary.both': '{services}% of services and {products}% of products',
  'biz.summary.from': 'from {date}',
  'biz.status.waiting': 'Waiting for {partner}',
  'biz.status.needsAnswer': 'Needs your answer',
  'biz.status.active': 'Active',
  'biz.status.ending': 'Ends after {date}',
  'biz.status.ended': 'Ended',
  'biz.status.declined': 'Declined',
  'biz.status.withdrawn': 'Withdrawn',
  'biz.pending.yours': 'The terms you sent',
  'biz.pending.yoursChange': 'New terms you proposed from {date}',
  'biz.ended.on': 'The last day it counted was {date}.',
  'biz.ended.link': 'It ended because the link or collective no longer allows it.',
  'biz.history': 'Earlier terms',
  'biz.history.version': 'Version {version}: {summary}, {basis}, from {date}',
  'biz.history.status.accepted': 'agreed',
  'biz.history.status.declined': 'declined',
  'biz.history.status.withdrawn': 'withdrawn',
  'biz.history.status.proposed': 'waiting for an answer',
  'biz.statements': 'Statements',

  // Propose form
  'form.business': 'Business',
  'form.label': 'Call it',
  'form.label.help': 'Only changes the word used on statements and reports.',
  'form.services': 'Share of services (%)',
  'form.products': 'Include products',
  'form.products.help':
    'Products sold at Checkout and credited to this calendar. The business that sold them shares these figures only by agreeing to this split.',
  'form.productsRate': 'Share of products (%)',
  'form.vat': 'Work it out on prices',
  'form.vat.help': 'Before VAT is usual. It only makes a difference if the business that pays is VAT registered.',
  'form.period': 'Settle up',
  'form.period.help': 'How often a statement is made, so you both know what to settle.',
  'form.start': 'Starts on',
  'form.backdated': 'This starts before today, so figures already in ResNeo will count once {partner} agrees.',
  'form.example': 'Last month this would have come to {owed}.',
  'form.example.detail': '{services} of completed bookings{products}.',
  'form.example.products': ' and {products} of products',
  'form.example.vat': "VAT isn't set up in ResNeo for {business}, so this uses prices as booked.",
  'form.send': 'Send to {partner}',
  'form.sent': 'Sent. {partner} needs to accept it before it counts.',

  // Answering and changing
  'respond.title': '{partner} proposed this split',
  'respond.change.title': '{partner} proposed new terms from {date}',
  'respond.accept': 'Accept',
  'respond.decline': 'Decline',
  'respond.accepted': 'Accepted. It counts from {date}.',
  'respond.declined': 'Declined. {partner} has been told.',
  'change.title': 'Propose new terms',
  'change.start': 'New terms start on',
  'change.help': 'The current terms stay in force until {partner} accepts.',
  'change.now': 'Now: {summary}.',
  'change.mustFollow': 'New terms must start after {date}, when the current terms began.',
  'change.sent': 'Sent. The current terms stay in force until {partner} accepts.',
  'withdraw': 'Withdraw',
  'withdraw.done': 'Withdrawn.',
  'withdraw.help': '{partner} will no longer be asked to accept these terms.',
  'end': 'End this split',
  'end.lastDay': 'Last day it counts',
  'end.help': '{partner} will be told. Figures up to and including the last day still count.',
  'end.after': 'Both businesses can still read its statements afterwards.',
  'end.confirm': 'End split',
  'end.done': 'Ended. The last day it counts is {date}.',

  // Reports
  'rep.tab': 'Commission splits',
  'rep.team.title': 'Your team',
  'rep.team.bookings': 'Services count from completed bookings at their booked price. Products and gift vouchers count from Checkout.',
  'rep.team.drill': 'Choose a name to see what it is worked out from.',
  'rep.team.settings': 'Change rates',
  'rep.biz.drill': 'Choose a split to see what it is worked out from.',
  'rep.col.date': 'Date',
  'rep.col.item': 'Item',
  'rep.col.sale': 'Sale',
  'rep.col.counted': 'Counted',
  'rep.col.part': 'Their part',
  'rep.col.rate': 'Rate',
  'rep.biz.title': 'Businesses you work with',
  'rep.biz.help': 'Shares agreed with other businesses, worked out on each calendar\'s completed bookings, and products where agreed.',
  'rep.biz.youOwe': 'You owe',
  'rep.biz.owedToYou': 'Owed to you',
  'rep.biz.col.split': 'Split',
  'rep.biz.col.direction': 'Who pays',
  'rep.biz.col.services': 'Services counted',
  'rep.biz.col.products': 'Products counted',
  'rep.biz.col.rate': 'Rate',
  'rep.biz.col.owed': 'Owed',
  'rep.biz.col.kept': 'Payer keeps',
  'rep.biz.none': 'No business splits for these dates.',
  'rep.biz.lines': '{calendar} at {business}',
  'rep.biz.line.booking': 'Booking',
  'rep.biz.line.sale': 'Sale {saleNo}',
  'rep.biz.line.refund': 'Refund on Sale {saleNo}',
  'rep.biz.vatNote': "VAT isn't set up in ResNeo for {business}, so its figures use prices as booked.",
  'rep.biz.settings': 'Manage splits',

  // Statements and Mark as paid
  'stmt.title': 'Statements',
  'stmt.help': 'One statement per {period} period. Mark a period as paid once you have settled it. ResNeo does not move any money.',
  'stmt.outstanding': 'Outstanding: {amount}',
  'stmt.outstanding.youOwe': 'You still owe {partner}: {amount}',
  'stmt.outstanding.owedToYou': '{partner} still owes you: {amount}',
  'stmt.soFar': 'So far: {amount}',
  'stmt.paidTotal': 'Marked paid: {amount}',
  'stmt.period': '{start} to {end}',
  'stmt.status.current': 'In progress',
  'stmt.status.outstanding': 'Outstanding',
  'stmt.status.paid': 'Paid',
  'stmt.status.nothing_owed': 'Nothing owed',
  'stmt.markPaid': 'Mark as paid',
  'stmt.note': 'Note (optional)',
  'stmt.notePlaceholder': 'For example, bank transfer',
  'stmt.marked': 'Marked paid by {name} on {date}',
  'stmt.markedNote': 'Note: {note}',
  'stmt.changed': 'The figures have changed since this was marked paid: it was {was} and is now {now}.',
  'stmt.undo': 'Undo',
  'stmt.undo.confirm': 'Undo the payment mark for {period}?',
  'stmt.undo.help': 'The period shows as outstanding again for both businesses.',
  'stmt.undone': 'No longer marked as paid.',
  'stmt.done': 'Marked as paid.',
  'stmt.empty': 'No periods yet. Statements start once the split is agreed.',

  // Errors the app checks before sending, or says itself (the routes answer with the same sentences)
  'err.notAllowed':
    'You can only agree a split on a calendar at a business you have a "Work as one team" link with, or that shares a live collective with you.',
  'err.lastDay': 'The last day must be today or later.',
  'err.startAfterEnd': 'The start date must be before the split ends.',
  'err.notFound': 'That split no longer exists.',
  'err.readOnly': 'This split ended because the link or collective no longer allows it, so its statements can only be read.',

  // Screen furniture (web and app)
  'ui.loadError': "We couldn't load this. Please try again.",
  'ui.retry': 'Try again',
  'ui.close': 'Close',
  'ui.rateInvalid': 'Enter a rate between 0% and 100%.',
  'ui.percentInvalid': 'Enter a percentage from 0 to 100.',
  'ui.percentPlaces': 'Use up to two decimal places.',
  'ui.saleOrBooking': 'Sale or booking',

  // (app) What the app says where the web needs no words.
  'app.adminOnly.title': 'For admins',
  // (app) The routes' own 403 sentence for anyone else.
  'app.adminOnly.body': 'Only admins can manage commission splits.',
  // (app) A request that never reached ResNeo, or came back with no sentence.
  'app.networkError': "We couldn't reach ResNeo. Check your connection and try again.",
  'app.saveError': "We couldn't save that. Please try again.",
  // (app) The way forward when there are no calendars: Availability Settings, Calendars tab.
  'app.calendars.add': 'Add a calendar',
  'app.calendars.none': 'There are no calendars to choose yet. Add a calendar first, then come back to set up a split.',
  // (app) The app's screen is called Linked venues (the web's 'cal.theirs.emptyAction' names its own).
  'app.linkedVenues': 'Go to Linked venues',
} as const;

export type SplitsCopyId = keyof typeof SPLITS_COPY;
export type SplitsCopyVars = Record<string, string | number | null | undefined>;

/**
 * One of the words above, with its `{placeholders}` filled (web `splitsCopy`); a placeholder with no
 * value stays as written. No imports, so light modules (the More tab's list) can use it.
 */
export function splitsT(id: SplitsCopyId, vars: SplitsCopyVars = {}): string {
  return SPLITS_COPY[id].replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? whole : String(v);
  });
}
