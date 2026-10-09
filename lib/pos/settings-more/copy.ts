import { useMemo } from 'react';

import { pluralVenueTerm } from '@/lib/venue/calendar-upcoming-bookings';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * The words every screen in the second half of Checkout settings shares (card readers, cards on
 * file, gift vouchers, loyalty card, commission, stock, online shop). Each screen keeps its own
 * words in its own copy file beside this one, written word for word from the web where the web has
 * them (src/app/dashboard/settings/checkout/copy.ts and the card's own copy module).
 *
 * Rules: plain, warm, second person; no em-dash anywhere; straight apostrophes; placeholders are in
 * {braces}; money arrives already formatted.
 */
export const SM_COPY = {
  // Web settings/checkout/copy.ts `common.*` and `err.POS_SETTINGS_STALE`.
  'common.save': 'Save changes',
  'common.cancel': 'Cancel',
  'common.saveError': "We couldn't save that. Please try again.",
  'common.networkError': "We couldn't reach ResNeo. Check your connection and try again.",
  'common.tryAgain': 'Try again',
  'err.POS_SETTINGS_STALE':
    "Someone else changed these settings while you were editing. We've loaded their changes. Check them, then save yours again.",
  // Web fields.tsx FormCard footer.
  'common.discard': 'Discard changes',
  'common.useTheirs': 'Use their changes',
  // The app's unsaved-changes guard (lib/pos/copy.ts `common.unsaved`, `x.leave`, `x.stay`).
  'common.unsaved': "You have changes that aren't saved. Leave without saving?",
  'common.leave': 'Leave without saving',
  'common.stay': 'Keep editing',
  'common.loadError': "We couldn't load these settings. Check your connection and try again.",
  'common.copied': 'Link copied.',
  'common.copyLink': 'Copy link',
  'common.shareLink': 'Share link',
  'common.open': 'Open',
  'common.qr.share': 'Share QR code',
  'common.qr.loading': 'The QR code is still loading. Try again in a moment.',
  'common.qr.error': "We couldn't make the QR code. Please try again.",
  'common.share.unavailable': 'Sharing is not available on this device.',
  // Gates: what a screen says instead of its settings (the web leaves the card out).
  'gate.posOff.title': "Checkout isn't on",
  'gate.posOff.body': "Checkout isn't available for your business right now.",
  'gate.adminOnly.title': 'For admins',
  'gate.adminOnly.body': 'Only an admin can change these settings. Ask an admin if something here needs changing.',
  'gate.featureOff.title': '{feature} is switched off',
  'gate.featureOff.body': 'Turn on {feature} in Checkout settings, Features, to set it up here.',
} as const;

export type SmCopyId = keyof typeof SM_COPY;
export type CopyVars = Record<string, string | number | null | undefined>;

/** `{name}` placeholders filled from `vars`; a missing one stays as written. */
export function fillText(template: string, vars: CopyVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? whole : String(v);
  });
}

export function smT(id: SmCopyId, vars: CopyVars = {}): string {
  return fillText(SM_COPY[id], vars);
}

/** The venue's own word for its clients: `client`, `clients`, `Clients` (web `clientWords`). */
export interface ClientWords {
  client: string;
  clients: string;
  Clients: string;
}

export function clientWordsFor(clientWord: string | null | undefined): ClientWords {
  const client = (clientWord ?? '').trim().toLowerCase() || 'client';
  const clients = pluralVenueTerm(client, 'client').toLowerCase();
  return { client, clients, Clients: clients.charAt(0).toUpperCase() + clients.slice(1) };
}

export function useClientWords(): ClientWords {
  const { terminology } = useVenueContext();
  return useMemo(() => clientWordsFor(terminology.client), [terminology.client]);
}
