import { fillText, type CopyVars } from './copy';

/**
 * Settings, Card readers, word for word from the web's `READER_COPY`
 * (src/components/pos/readers/copy.ts, UX spec §9.8). The few app-only lines are marked (app).
 */
export const READERS_COPY = {
  'set.readers.title': 'Card readers',
  'set.readers.needStripe': 'Connect Stripe in Settings, Payments before adding a card reader.',
  'set.readers.inPersonOff':
    "Card payments in person are switched off, so your readers can't take payments yet. Turn them on in Settings, Booking Settings, Taking payment in person.",
  'set.readers.type.s700': 'Stripe Reader S700',
  'set.readers.type.s710': 'Stripe Reader S710 (4G)',
  'set.readers.type.wisepos': 'BBPOS WisePOS E',
  'set.readers.type.simulated': 'Test reader',
  'set.readers.type.other': 'Card reader',
  'set.readers.lastSeen': 'Last seen {relative}',
  'set.readers.rename': 'Rename',
  'set.readers.remove': 'Remove',
  'set.readers.remove.title': 'Remove {reader}?',
  'set.readers.remove.body':
    "It's removed from your Stripe account and stops taking payments until you pair it again. Payments already taken aren't affected.",
  'set.readers.remove.busy': 'A payment is in progress on {reader}. Finish or cancel it first.',
  'set.readers.moved': 'Registered to another business on {date}. It no longer takes payments for you.',
  'set.readers.movedPill': 'Moved away',
  'set.readers.add': 'Add a card reader',
  'set.readers.add.title': 'Add a card reader',
  'set.readers.step1': 'Plug the reader in and connect it to your Wi-Fi.',
  'set.readers.step2': 'On the reader, open Settings and choose Generate pairing code.',
  'set.readers.step3': 'Type the code below and give the reader a name.',
  'set.readers.code': 'Pairing code',
  'set.readers.name': 'Name',
  'set.readers.name.placeholder': 'Front desk',
  'set.readers.till': 'Use it at',
  'set.readers.till.none': 'No till for now',
  'set.readers.add.confirm': 'Add reader',
  'set.readers.added': '{reader} is ready to take payments.',
  'set.readers.simulated': 'Add a test reader',
  'set.readers.wisepos.note':
    'Stripe stopped selling this reader on 1 September 2026. It gets only essential fixes from 1 February 2028 and stops working on 1 February 2031.',
  'set.readers.ownReader':
    'Already have a Stripe reader, for example from Phorest? Pair it the same way. Owning it, and any rental agreement, is up to you.',
  'set.readers.movedHere': 'It was registered to another account before. Now it takes payments for {venue}.',
  'set.readers.branding': "Your readers show your logo when they're idle, and your tip suggestions. ResNeo sets these up for you.",
  'set.readers.getOne':
    "Need a card reader? Contact ResNeo support and we'll help you get one, or pair a Stripe reader you already have. You can take cards on your phones without one.",
  'set.readers.empty': "You haven't added a card reader yet.",
  'set.readers.testCard': 'Present a test card',
  'set.readers.testCard.done': 'Test card presented on {reader}.', // (app) the web says nothing on success
  'set.readers.refresh': 'Check status',
  'set.readers.saveName': 'Save changes',
  'reader.status.online': 'Ready',
  'reader.status.offline': 'Offline',
  'reader.status.busy': 'Busy',
  'common.cancel': 'Cancel',
  'common.loading': 'Loading...',
} as const;

export type ReadersCopyId = keyof typeof READERS_COPY;

export function readersT(id: ReadersCopyId, vars: CopyVars = {}): string {
  return fillText(READERS_COPY[id], vars);
}

/** The reader's model as the settings show it (web `modelLabel`). */
export function readerModelLabel(model: string | null | undefined): string {
  switch (model) {
    case 's700':
      return READERS_COPY['set.readers.type.s700'];
    case 's710':
      return READERS_COPY['set.readers.type.s710'];
    case 'wisepos':
      return READERS_COPY['set.readers.type.wisepos'];
    case 'simulated':
      return READERS_COPY['set.readers.type.simulated'];
    default:
      return READERS_COPY['set.readers.type.other'];
  }
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" (web `lastSeenText`). */
export function lastSeenText(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const seconds = Math.max(0, Math.round((now.getTime() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
