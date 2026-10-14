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
    'Set the shares people and businesses earn from what your calendars take, and see what is owed. ResNeo works out the figures. Paying them is up to you.',

  // Your team
  'team.title': 'Your team',
  'team.intro':
    'What your business pays the people who work your calendars, whether they are employed or self-employed. Rates are dated, so a change never alters figures already worked out.',
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
  'team.label.title': 'Shown as',
  'team.label.help': 'Only changes how the report describes this person.',
  'team.label.saved': 'Saved.',
  'team.basis.none': "VAT isn't set up in ResNeo, so figures use prices as booked.",
  'team.people.title': 'People',

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
  'biz.title': 'Businesses you work with',
  'biz.intro':
    'Agree a share of one calendar\'s revenue with a business you have a "Work as one team" link with, or with another member of your collective. Both businesses must agree before anything counts.',
  'biz.none':
    'Splits need a link where the other business shares its calendar with full detail and booking rights ("Work as one team"), or a live collective you both belong to.',
  'biz.empty': 'No splits yet.',
  'biz.propose': 'Propose a split',
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
  'form.title': 'Propose a split',
  'form.business': 'Business',
  'form.calendar': 'Calendar',
  'form.calendar.theirs': 'Their calendars ({partner} pays you)',
  'form.calendar.yours': 'Your calendars (you pay {partner})',
  'form.calendar.none': 'Choose a business first.',
  'form.label': 'Call it',
  'form.services': 'Share of services (%)',
  'form.products': 'Include products',
  'form.products.help':
    'Products sold at Checkout and credited to this calendar. The business that sold them shares these figures only by agreeing to this split.',
  'form.productsRate': 'Share of products (%)',
  'form.vat': 'Work it out on prices',
  'form.period': 'Settle up',
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
  'change.mustFollow': 'New terms must start after {date}, when the current terms began.',
  'change.sent': 'Sent. The current terms stay in force until {partner} accepts.',
  'withdraw': 'Withdraw',
  'withdraw.done': 'Withdrawn.',
  'end': 'End this split',
  'end.lastDay': 'Last day it counts',
  'end.help': '{partner} will be told. Figures up to and including the last day still count.',
  'end.confirm': 'End split',
  'end.done': 'Ended. The last day it counts is {date}.',

  // Reports
  'rep.tab': 'Commission splits',
  'rep.team.title': 'Your team',
  'rep.team.bookings': 'Services count from completed bookings at their booked price. Products and gift vouchers count from Checkout.',
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
  'rep.biz.col.kept': 'Kept',
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
  'stmt.undone': 'No longer marked as paid.',
  'stmt.done': 'Marked as paid.',
  'stmt.empty': 'No periods yet. Statements start once the split is agreed.',

  // Errors the app checks before sending, or says itself (the routes answer with the same sentences)
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
  'form.business.choose': 'Choose a business',
  'form.calendar.choose': 'Choose a calendar',

  // (app) What the app says where the web needs no words.
  'app.adminOnly.title': 'For admins',
  // (app) The routes' own 403 sentence for anyone else.
  'app.adminOnly.body': 'Only admins can manage commission splits.',
  // (app) A request that never reached ResNeo, or came back with no sentence.
  'app.networkError': "We couldn't reach ResNeo. Check your connection and try again.",
  'app.saveError': "We couldn't save that. Please try again.",
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
