/**
 * Manage collective, Settings (web Docs/card-on-file-plan.md §21, D27, D28): the words, copied
 * from the web's `collectiveCopy` table (`src/lib/linked-accounts/collective-copy.ts`, the `set.*`
 * keys, 2026-11-17) so the two read the same. Most sentences in the section come composed from the
 * server (`GET /api/venue/collectives/[id]/settings`); these are the labels around them.
 * No em-dashes.
 */

export const SETTINGS_COPY = {
  'set.tab': 'Settings',
  'set.tabPicker': 'Section',
  'set.host.top': 'These settings apply to every business in {collective}.',
  'set.member.top': 'Set by {host}. Ask {host} to change it.',
  'set.saved': 'Saved for every business in {collective}.',
  'set.on': 'On',
  'set.off': 'Off',
  'set.rules.title': 'Booking rules',
  'set.rules.notLive':
    'These apply once {collective} is live, with at least two businesses in it. You can change them here then.',
  'set.rules.waitlistMode': 'When a slot opens: {mode}',
  'set.rules.anyPriority': 'Who gets the booking: the first free person in your priority order',
  'set.rules.anyRandom': 'Who gets the booking: a free person, chosen at random',
  'set.page.title': 'Collective page',
  'set.page.edit': 'Edit the page',
  'set.page.summary': 'See the page summary',
  'set.page.copy': 'Copy link',
  'set.page.copied': 'Link copied.',
  'set.page.open': 'Open',
  'set.hostDetails.profile': 'Open Profile',
  'set.hostDetails.businessHours': 'Open Business hours',
  'set.clients.title': 'Clients',
  'set.clients.open': 'Open Clients',
  'set.noShow.nothingToSet': 'There is nothing to set here.',
  'set.noShow.members': 'See members',
  'set.noShow.hideMembers': 'Hide members',
  'set.noShow.host': '{venue} (host)',
  'set.each.title': 'Set by each business',
  'set.each.open': 'Open',
  'set.unavailable': 'Collective settings are not available yet. Update the web dashboard, then try again.',
  'set.loadError': 'Could not load the settings. Pull down to try again.',
  'set.saveError': 'That did not save. Please try again.',
  // Changing a collective setting from the host's own Settings, Booking settings (§21.3 item 3).
  'set.bs.confirmTitle': 'Change it for everyone?',
  'set.bs.confirmBody': 'This changes it for every business in {collective}.',
  'set.bs.confirmYes': 'Change for everyone',
  'set.bs.confirmNo': 'Cancel',
  'set.bs.seeAll': 'See all collective settings',
} as const;

export type SettingsCopyId = keyof typeof SETTINGS_COPY;

/** The words for `id`, with `{name}` placeholders filled. */
export function settingsCopy(id: SettingsCopyId, params: Record<string, string | number> = {}): string {
  return SETTINGS_COPY[id].replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** The rules the collective decides, in Settings, Booking settings order (sign-in first). */
export const COLLECTIVE_RULE_ROWS = [
  { key: 'require_account_login', title: 'Require sign-in to book' },
  { key: 'any_available_practitioner', title: 'Any available practitioner' },
  { key: 'staff_first_booking_flow', title: 'Staff-first booking' },
  { key: 'guest_self_reschedule', title: 'Client self-reschedule' },
  { key: 'waitlist_v2', title: 'Appointment waitlist' },
] as const;

export type CollectiveRuleKey = (typeof COLLECTIVE_RULE_ROWS)[number]['key'];

/** Web `WAITLIST_MODE_LABELS` titles. */
export const WAITLIST_MODE_TITLES: Record<string, string> = {
  staff_choose: 'Staff choose',
  notify_in_order: 'First in line, notify in order',
  notify_all: 'Offer to all',
};

/** Where Manage collective, Settings lives in the app (the D28 deep link). */
export const COLLECTIVE_SETTINGS_ROUTE = '/collective-area?tab=settings';
