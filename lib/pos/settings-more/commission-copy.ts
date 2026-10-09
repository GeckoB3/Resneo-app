import { fillText, type CopyVars } from './copy';
import type { CommissionItemType } from './types';

/**
 * Settings, Commission, word for word from the web's `COMMISSION_COPY`
 * (src/lib/pos/commission/copy.ts, UX spec §18.34) and the words the web card writes inline
 * (src/app/dashboard/settings/checkout/CommissionCard.tsx). The few app-only lines are marked (app).
 */
export const COMMISSION_SET_COPY = {
  'set.comm.title': 'Commission',
  'set.comm.help': 'Set what you pay your team on what they sell. ResNeo works out the figures, and you pay them through your payroll.',
  'set.comm.basis': 'Work out commission on',
  'set.comm.basis.excl': 'Prices without VAT',
  'set.comm.basis.incl': 'Prices including VAT',
  'set.comm.basis.help': "This only makes a difference if you're VAT registered. Tips, service charges and delivery never count.",
  'set.comm.basis.saved': 'Commission settings saved.', // web inline
  'set.comm.defaults': 'For everyone',
  'set.comm.type.service': 'Services',
  'set.comm.type.product': 'Products',
  'set.comm.type.voucher': 'Gift vouchers',
  'set.comm.voucher.help': "Usually 0%. What a voucher pays for earns commission when it's used, so a rate here would pay twice.",
  'set.comm.from': 'From {date}',
  'set.comm.byCategory': 'By category',
  'set.comm.category.add': 'Add a category rate',
  'set.comm.byPerson': 'For one person',
  'set.comm.person.add': "Add a person's rates",
  'set.comm.change': 'Change rate',
  'set.comm.history': 'Earlier rates',
  'set.comm.stop': 'Stop this rate',
  'set.comm.backdated':
    "This starts before today, so it changes commission already worked out from {date}. If you've exported those figures, the report will show they've changed.",
  'set.comm.precedence':
    "The most specific rate wins: a person's rate for a category, then their rate for the type, then your rate for the category, then your rate for everyone. With none, it's 0%.",
  'set.comm.empty': 'No rates yet. Add one for everyone to start.',
  // The rate sheet (web inline).
  'set.comm.sheet.type': 'Type',
  'set.comm.sheet.person': 'Team member',
  'set.comm.sheet.person.choose': 'Choose a team member',
  'set.comm.sheet.category.choose': 'Choose a category',
  'set.comm.sheet.category.any': 'Any category',
  'set.comm.sheet.rate': 'Rate (%)',
  'set.comm.sheet.from': 'Starts on',
  'set.comm.sheet.rateInvalid': 'Enter a rate between 0% and 100%.',
  'set.comm.sheet.save': 'Save changes',
  'set.comm.sheet.cancel': 'Cancel',
  'set.comm.rate.saved': 'Commission rate saved.',
  'set.comm.fallback.person': 'Team member',
  'set.comm.fallback.category': 'Category',
  // (app) The web leaves the card out when the server has no rates for it; the app says so.
  'set.comm.unavailable.title': "Commission isn't available yet",
  'set.comm.unavailable.body': "Commission rates aren't available for your business right now. Please check again later.",
  'set.comm.loadError': "We couldn't load your commission rates. Check your connection and try again.", // (app)
} as const;

export type CommissionSetCopyId = keyof typeof COMMISSION_SET_COPY;

export function commT(id: CommissionSetCopyId, vars: CopyVars = {}): string {
  return fillText(COMMISSION_SET_COPY[id], vars);
}

export const COMMISSION_TYPES: CommissionItemType[] = ['service', 'product', 'voucher'];

export function typeWords(t: CommissionItemType): string {
  return commT(t === 'service' ? 'set.comm.type.service' : t === 'product' ? 'set.comm.type.product' : 'set.comm.type.voucher');
}

/** Basis points as the percentage people type and read: 1250 to "12.5", 500 to "5" (web `bpsToPercentText`). */
export function bpsToPercentText(bps: number | null | undefined): string {
  if (bps == null) return '';
  const pct = bps / 100;
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
}
