/**
 * The two emails ResNeo itself sends, and whether this customer wants them.
 *
 * These are NOT the per-category booking matrix that C4 shipped and that both
 * this app and the web have since withdrawn. That matrix tried to govern what a
 * VENUE sends about a booking, was consulted in one place, and was bypassed by
 * everything a customer would reach for it to stop. These two are a different
 * thing entirely: they are about mail from ResNeo, they were never part of the
 * matrix, and the web still has both.
 *
 * The distinction is worth holding on to, because "remove the toggles that did
 * nothing" and "remove all the toggles" are one careless step apart.
 */

/** A preferences bag as it arrives: free-form jsonb, shape not guaranteed. */
type Bag = Record<string, unknown>;

/** The keys this surface owns. Deliberately two, and deliberately named. */
export type AccountEmailKey = 'operational_email' | 'marketing_email';

export interface AccountEmailPreferences {
  operational_email: boolean;
  marketing_email: boolean;
}

function asBag(raw: unknown): Bag {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Bag) : {};
}

function isPlainObject(v: unknown): boolean {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Whether the column has been split into `staff` and `customer` halves yet.
 *
 * The web is mid-migration: rows written before it are a flat blob holding both
 * key sets, rows written after are namespaced. A reader that knows only one
 * shape is correct today and wrong after the migration lands, or the other way
 * round, with no error either time. It just shows the customer defaults that
 * are not theirs.
 *
 * Neither `staff` nor `customer` is itself a preference key on either side,
 * which is what makes this test safe rather than a guess.
 */
function isNamespaced(bag: Bag): boolean {
  return isPlainObject(bag.staff) || isPlainObject(bag.customer);
}

/**
 * Read the two flags, whichever shape the column is in.
 *
 * **The defaults are asymmetrical, and that is the whole point.** Account
 * notices default ON, because somebody who has expressed nothing still expects
 * to be told when something about their account changes. Marketing defaults
 * OFF, because consent to be marketed at is given rather than assumed, and a
 * truthy default would opt in every existing customer the moment this shipped.
 *
 * Both are written as explicit comparisons rather than `??`, because `false`
 * is falsy: `stored ?? true` reads a deliberate opt-out as "unset" and turns it
 * back on, which is the classic way to resurrect mail somebody switched off.
 */
export function readAccountEmailPreferences(raw: unknown): AccountEmailPreferences {
  const bag = asBag(raw);
  const p = isNamespaced(bag) ? asBag(bag.customer) : bag;
  return {
    operational_email: p.operational_email !== false,
    marketing_email: p.marketing_email === true,
  };
}

/**
 * The patch body for one flag.
 *
 * ONE key, never the whole bag. The route merges into a free-form column the
 * staff app also writes to, so sending everything this screen believes would
 * write back defaults the customer never chose. The web had exactly that bug: a
 * customer client sending its own keys erased every staff push preference on
 * the row, and linked accounts actively create users who have both.
 *
 * Sent FLAT rather than wrapped in a `customer` object. The server routes any
 * key outside the fixed staff set into the customer namespace itself, so flat
 * is what it expects and what older builds already send.
 */
export function accountEmailPatch(key: AccountEmailKey, value: boolean): Record<string, boolean> {
  return { [key]: value };
}

/** What each switch says it governs. */
export function accountEmailLabel(key: AccountEmailKey): string {
  return key === 'operational_email'
    ? 'Account emails from ResNeo'
    : 'ResNeo product updates and news';
}

/** The line under each switch, saying what it does and does not cover. */
export function accountEmailDescription(key: AccountEmailKey): string {
  return key === 'operational_email'
    ? 'Service notices and changes to your account. Security emails, like sign-in links and password changes, are always sent.'
    : 'Updates about ResNeo itself. Not offers from the venues you book with.';
}

/**
 * Where the messages this does NOT govern actually come from.
 *
 * Without this the screen has three things a customer could read as "email
 * settings" and nothing saying which is which. It is also the honest answer to
 * the question the withdrawn matrix pretended to answer.
 */
export const BOOKING_EMAIL_NOTE =
  'Messages about a booking, such as confirmations, reminders and changes, are set by the venue you booked with. Offers from a venue are under Offers from venues below.';

/** Both keys, in the order the web shows them. */
export const ACCOUNT_EMAIL_KEYS: readonly AccountEmailKey[] = [
  'operational_email',
  'marketing_email',
];
