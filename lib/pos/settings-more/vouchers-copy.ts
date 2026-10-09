import { fillText, type CopyVars } from './copy';

/**
 * Settings, Gift vouchers, word for word from the web: the deck's ids from
 * src/components/pos/vouchers/voucher-copy.ts (`VOUCHER_COPY`), and the sentences the web writes
 * inline in GiftVouchersCard.tsx, VoucherPageLink.tsx, StoredValueDialogs.tsx and
 * VoucherImportDialog.tsx (keyed here under `web.*`). The few app-only lines are marked (app).
 */
export const VOUCHERS_COPY = {
  // Settings, Gift vouchers (§20.9)
  'feat.vouchers.setup': 'Gift vouchers are ready to set up. Choose your amounts and terms to start selling them.',
  'set.vch.title': 'Gift vouchers',
  'set.vch.help':
    'Sell gift vouchers at the till and online. People can spend them on any service or product, over as many visits as they like.',
  'set.vch.presets': 'Amounts to offer',
  'set.vch.presets.add': 'Add an amount',
  'vsell.custom': 'Another amount',
  'set.vch.min': 'Smallest amount',
  'set.vch.max': 'Largest amount',
  'set.vch.expiry': 'How long they last',
  'set.vch.expiry.months': "{months} months from when they're bought",
  'set.vch.expiry.none': 'They never run out',
  'set.vch.expiry.help': 'The date is printed on each voucher. A change only affects vouchers sold from now on.',
  'set.vch.terms': 'Your voucher terms',
  'set.vch.terms.help': 'Buyers agree to these when they buy online. Keep them short and clear.',
  'set.vch.terms.template': 'Start from our template',
  'set.vch.terms.expiry': 'Each voucher can be used until the date printed on it, {months} months after it was bought.',
  'set.vch.terms.noExpiry': "Our vouchers don't run out.",
  'set.vch.online': 'Sell gift vouchers online',
  'set.vch.online.help': 'Adds a Gift vouchers section to your booking page, and a page you can share.',
  'set.vch.online.needs': 'To sell online, write your voucher terms and set up card payments first.',
  'set.vch.link': 'Your gift voucher page',
  'set.vch.qr': 'Download QR code',
  'set.vch.design': 'How your vouchers look',

  // GiftVouchersCard.tsx, inline
  'web.saved': 'Gift voucher settings saved.',
  'web.removeAmount': 'Remove {amount}',
  'web.months': 'Months',
  'web.termsCount': '{count} / 2,000',
  'web.template.title': 'Replace your voucher terms?',
  'web.template.body': 'This replaces the text you have now with our template. You can edit it before you save.',
  'web.template.confirm': 'Use the template',
  'web.colour.useBooking': 'Use my booking page colour',
  'web.colour.booking': 'Your booking page colour',
  // The server's sentences for these fields (lib/pos/validation.ts), shown before sending.
  'web.months.invalid': 'Choose at least 1 month.',
  'web.colour.invalid': 'Choose a colour',
  // VoucherPageLink.tsx
  'web.copied': 'Copied',
  // (app) the colour field: preset swatches and a typed colour code.
  'app.colour.code': 'Colour code, like #003B6F',
  'app.colour.swatch': 'Use the colour {colour}',

  // Adding an existing voucher (§20.6)
  'vadd.open': 'Add an existing voucher',
  'vadd.title': 'Add an existing voucher',
  'vadd.body':
    "Record a voucher you sold before ResNeo, on paper or with Booksy or Fresha, so you can take it here. It isn't money taken today, so it won't show in your takings.",
  'vadd.codeChoice': 'Voucher code',
  'vadd.code.own': 'Use the code printed on the voucher',
  'vadd.code.new': 'Give it a new ResNeo code',
  'vadd.code.taken': 'Another voucher already uses that code.',
  'vadd.balance': 'Amount left on it',
  'vadd.expiry': 'Use by',
  'vadd.noExpiry': 'No expiry date',
  'vadd.holder': "Holder's name (optional)",
  'vadd.email': "Holder's email (optional)",
  'vadd.client': 'Link to a {client} (optional)',
  'vadd.note': 'Note (optional)',
  'vadd.confirm': 'Add voucher',
  'vadd.done': 'Gift voucher ending {last4} added, with {amount} on it.',
  'vadd.newCode':
    "The new code is {code}. Write it on the voucher or print a new one now. You won't see the full code here again.",
  'vpay.code.invalid': "That doesn't look like a voucher code. Check it and try again.",
  // StoredValueDialogs.tsx and the web's guest search helpers, inline
  'web.cancel': 'Cancel',
  'web.done': 'Done',
  'web.removeClient': 'Remove {name}',
  'web.guest.anonymous': 'Anonymous',
  'web.guest.noContact': 'No contact details on file',
  // (app) the client search field's hint.
  'app.client.search': 'Search by name, email or phone',

  // Importing (§20.7)
  'vimp.open': 'Import vouchers from a file',
  'vimp.title': 'Import gift vouchers',
  'vimp.body': "Bring in vouchers you sold before ResNeo, from a spreadsheet saved as CSV. They won't show in your takings.",
  'vimp.template': 'Download a template',
  'vimp.row.new': 'Will be added',
  'vimp.row.exists': "Code already used, so it's skipped",
  'vimp.row.error': 'Problem: {problem}',
  'vimp.summary': '{count} vouchers to add, worth {amount} in total. {problems} rows have problems.',
  'vimp.newCodes': 'Give every voucher a new ResNeo code',
  'vimp.commit': 'Import vouchers',
  'vimp.done': '{count} vouchers added, worth {amount} in total.',
  'vimp.downloadCodes': 'Download the new codes. You can only do this once.',
  // VoucherImportDialog.tsx, inline
  'web.imp.file': 'CSV file',
  'web.imp.tooBig': 'The file is larger than 5 MB.',
  'web.imp.unreadable': "We couldn't read that file. Save it as CSV and try again.",
  'web.imp.back': 'Back',
  'web.imp.check': 'Check the file',
  'web.imp.chooseColumn': 'Choose a column',
  'web.imp.notInFile': 'Not in the file',
  'web.imp.optional': '{label} (optional)',
  'web.imp.row': 'Row {row}',
  'web.imp.col.code': 'Code',
  'web.imp.col.balance': 'Amount left',
  'web.imp.col.expiry': 'Use by',
  'web.imp.col.holder_name': "Holder's name",
  'web.imp.col.holder_email': "Holder's email",
  'web.imp.col.note': 'Note',
  // (app) picking the file, and a share sheet that could not open.
  'app.imp.pick': 'Choose a CSV file',
  'app.imp.pickError': "That file couldn't be opened. Please try again.",
  'app.imp.shareError': "We couldn't open the share sheet. Please try again.",
} as const;

export type VouchersCopyId = keyof typeof VOUCHERS_COPY;

export function vchT(id: VouchersCopyId, vars: CopyVars = {}): string {
  return fillText(VOUCHERS_COPY[id], vars);
}

/**
 * `set.vch.terms.templateText` (§18.32), as the web's `voucherTermsTemplate`: the template, with the
 * expiry sentence from `set.vch.terms.expiry` or `set.vch.terms.noExpiry`.
 */
export function voucherTermsTemplate(venue: string, expiryMonths: number | null): string {
  const expirySentence =
    expiryMonths == null || !Number.isFinite(expiryMonths)
      ? vchT('set.vch.terms.noExpiry')
      : vchT('set.vch.terms.expiry', { months: expiryMonths });
  return [
    `Gift vouchers at ${venue}`,
    `You can use a ${venue} gift voucher for any service or product we sell, in one visit or over several. Anything left after a visit stays on the voucher for next time. ${expirySentence}`,
    "Gift vouchers can't be exchanged for cash. If you bought a voucher online, you can cancel it within 14 days of buying it for a full refund, as long as none of it has been used.",
    'If you have a question about a voucher, please contact us.',
  ].join('\n\n');
}
