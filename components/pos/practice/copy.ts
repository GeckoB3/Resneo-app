import { fillCopy, type CopyVars } from '@/lib/pos/copy';

/**
 * The practice sale's words in the app (POS test round 2026-10-11, Part 4, W11; design
 * `part4-onboarding-proposal.md` section 6.3, the source of truth for wording). Keys in the web's
 * `setup.practice.*` form are word for word the web till's deck
 * (`src/components/pos/practice/copy.ts`: W11's lines and the sentences the web added for the
 * screens), so the web and the app never drift. `app.setup.practice.*` are the app's own: the one
 * line where the web speaks of "your phone" from the desk while here the practice runs on the phone
 * itself, and the few a phone's sheets need. The £1 card check is the web's only, for now.
 *
 * Rules `copy.test.ts` enforces: no em-dash anywhere, straight apostrophes, no currency symbol next
 * to a money placeholder (money arrives formatted), every placeholder filled by its caller.
 */
export const PRACTICE_COPY = {
  // Design 6.3, W11.
  'setup.practice.banner': 'Practice sale. Nothing here is real, and no money moves.',
  'setup.practice.coach.basket': 'This is the bill. When you check out a booking, everything the client had is already here.',
  'setup.practice.coach.add': "Add a product, or anything else they're buying, here.",
  'setup.practice.coach.discount': 'Give a discount here. Your team can take off up to {limit}%.',
  'setup.practice.coach.credit': 'Each line shows who gets the credit, for tips and commission. Tap it to change.',
  'setup.practice.coach.pay': "When they're ready to pay, choose how. Try one: it's only practice.",
  'setup.practice.sim.phone':
    'In a real sale, this goes to your phone. Your client taps their card on it, and the sale finishes by itself.',
  'setup.practice.sim.reader': 'In a real sale, the reader on your desk asks your client to tap or insert their card.',
  'setup.practice.sim.cash': 'Type what they gave you, and Checkout works out the change.',
  'setup.practice.sim.link': 'Your client gets a link by text or email and pays on their own phone.',
  'setup.practice.sim.done': 'Paid. This is the moment the receipt goes out.',
  'setup.practice.receipt': "This is what your client's receipt looks like.",
  'setup.practice.finish': 'Finish practice',
  'setup.practice.finished': "That's it. Your practice sale has been cleared away.",

  // The sentences the web added for the screens (its `PRACTICE_COPY_ADDED`).
  'setup.practice.saleTitle': 'Practice sale',
  // The empty bill: a practice sale takes products and the practice item, never a service or a fee.
  'setup.practice.empty': 'Add a product or the practice item to start.',
  'setup.practice.back': 'Back to set-up',
  'setup.practice.coach.step': 'Tip {n} of {total}',
  'setup.practice.coach.next': 'Next',
  'setup.practice.coach.done': 'Got it',
  'setup.practice.coach.skip': 'Skip the tips',
  'setup.practice.item': 'Practice item',
  'setup.practice.services':
    'In a real checkout, the services from the booking come with it, so a practice sale leaves the diary alone.',
  'setup.practice.watermark': 'Practice',
  'setup.practice.receipt.frame': 'Your practice receipt',
  'setup.practice.receipt.error': "We couldn't show the receipt just now.",

  // The app's own (app).
  // The web's `sim.phone` speaks from the desk ("this goes to your phone"); here it is this phone.
  'app.setup.practice.sim.phone': 'In a real sale, your client taps their card, phone or watch on this phone, and the sale finishes by itself.',
  'app.setup.practice.item.detail': 'A pretend item to try things with',
  'app.setup.practice.noProducts': "You haven't added any products yet. Try the practice item instead.",
  'app.setup.practice.client': 'Nobody is attached to a practice sale.',
  'app.setup.practice.receipt.loading': 'Getting the receipt ready…',
  // A server that did not mark the new sale as practice: it is cleared away at once, never used.
  'app.setup.practice.unavailable':
    "Practice sales aren't ready yet for your account. Nothing was taken. Please try again later.",
} as const;

export type PracticeCopyId = keyof typeof PRACTICE_COPY;
export type PracticeT = (id: PracticeCopyId, vars?: CopyVars) => string;

/** One string from the deck, filled. */
export function practiceT(id: PracticeCopyId, vars: CopyVars = {}): string {
  return fillCopy(PRACTICE_COPY[id], vars);
}
