/**
 * Which messages a customer has asked to receive, and on which channel.
 *
 * The shape MIRRORS the web's `customer-channel-preferences.ts` rather than
 * reinventing it, because both write the same `user_profiles.notification_
 * preferences` column and a disagreement would be invisible until somebody
 * stopped getting reminders.
 */

export type PreferenceCategory = 'reminders' | 'changes' | 'marketing';
export type PreferenceChannel = 'email' | 'sms' | 'push';

/**
 * The pairs a customer may actually switch.
 *
 * Three absences are deliberate and none is an oversight:
 *
 * - **`changes:email` is missing.** A booking that moved or was cancelled is
 *   transactional, and a venue that changed an appointment must be able to say
 *   so. Offering a switch would promise silence ResNeo cannot honour.
 * - **`confirmations` are missing entirely.** Same reason, more so.
 * - **Every push pair is missing.** Nothing sends customer push yet. A toggle
 *   that changes nothing is worse than no toggle, because it is a promise.
 */
export const CONTROLLABLE: readonly `${PreferenceCategory}:${PreferenceChannel}`[] = [
  'reminders:email',
  'reminders:sms',
  'changes:sms',
  'marketing:email',
  'marketing:sms',
];

/** The key a pair is stored under, e.g. `reminders_sms`. */
export function preferenceKey(category: PreferenceCategory, channel: PreferenceChannel): string {
  return `${category}_${channel}`;
}

export type PreferenceBag = Record<string, unknown>;

export interface PreferenceRow {
  category: PreferenceCategory;
  channel: PreferenceChannel;
  enabled: boolean;
}

/**
 * Read the matrix, applying the same defaults the server does.
 *
 * The defaults are not symmetrical, and the asymmetry is the point.
 * **Reminders and changes default ON**: a customer who has never touched these
 * expects to be told about their own booking. **Marketing defaults OFF**,
 * because consent to be marketed at is given, not assumed, and reading it any
 * other way would opt people in silently.
 *
 * Marketing also falls back to the pre-matrix `marketing_email` flag when the
 * matrix is silent, which is what stops an existing customer's answer being
 * forgotten the day the matrix shipped.
 */
export function readPreferences(prefs: PreferenceBag | null | undefined): PreferenceRow[] {
  const bag = prefs ?? {};
  return CONTROLLABLE.map((pair) => {
    const [category, channel] = pair.split(':') as [PreferenceCategory, PreferenceChannel];
    const stored = bag[preferenceKey(category, channel)];

    if (typeof stored === 'boolean') {
      return { category, channel, enabled: stored };
    }
    if (category === 'marketing') {
      return { category, channel, enabled: bag.marketing_email === true };
    }
    return { category, channel, enabled: true };
  });
}

/**
 * The patch body for one toggle.
 *
 * ONE KEY, never the whole matrix. The web route MERGES what it is sent into a
 * free-form column shared with the staff app, so sending the full bag would
 * write back defaults the customer never chose, and a client that sent only its
 * own keys used to erase every staff push preference on the row. Linked
 * accounts actively create users who have both.
 */
export function preferencePatch(
  category: PreferenceCategory,
  channel: PreferenceChannel,
  enabled: boolean,
): Record<string, boolean> {
  return { [preferenceKey(category, channel)]: enabled };
}

/** What a row is called on screen. */
export function preferenceLabel(category: PreferenceCategory): string {
  if (category === 'reminders') return 'Booking reminders';
  if (category === 'changes') return 'Changes to your bookings';
  return 'Offers and news';
}

export function channelLabel(channel: PreferenceChannel): string {
  if (channel === 'email') return 'Email';
  if (channel === 'sms') return 'Text message';
  return 'Push';
}

/**
 * The sentence explaining what a customer cannot switch off, so the absence is
 * stated rather than left to look like a gap.
 */
export const ALWAYS_SENT_NOTE =
  'Confirmations, and emails about a booking that has changed, are always sent. They are how a venue tells you something about a booking you have made.';
