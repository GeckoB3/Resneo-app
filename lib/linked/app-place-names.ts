/**
 * The app's names for the places the web's collective sentences point to (CQ-10.11, R2-29).
 *
 * The copy decks (`lib/linked/setup-copy.ts`, `lib/collective-area/copy.ts`) hold the web's sentences
 * word for word, so the two never drift. A few of those sentences name a web screen: "Linked
 * Accounts", "Settings, Payments", "Settings, Booking Page", "this tab" (the web's Linked Accounts
 * tab) or "your dashboard". In the app those places have other names, so `setupCopy` and `areaCopy`
 * swap each such phrase for the app's own, and this list is the only difference between the decks
 * and the web. A test checks that every phrase here is still in its sentence, so a web rewording that
 * drops one is caught rather than silently shown with the web's place name.
 */

type PlaceSwap = readonly [web: string, app: string];

const LINKED = 'Linked venues';
const VENUE_COLLECTIVES = 'the Venue collectives screen';
const LINKED_SCREEN = 'the Linked venues screen';

export const APP_PLACE_NAMES: Readonly<Record<string, readonly PlaceSwap[]>> = {
  // Linking and joining (setup-copy.ts)
  'create.name.help': [['called in your dashboard', 'called inside ResNeo']],
  'create.venues.empty.body': [['under Active links', `on ${LINKED_SCREEN}`]],
  'create.done.cta': [['Go to Collective', 'Go to Manage Collective']],
  'create.next.design.body': [['under Settings, Booking Page', 'under More, Booking page']],
  'join.block.links': [['under Linked accounts', `under ${LINKED}`]],
  'join.links.lasts': [['in Linked Accounts', `in ${LINKED}`]],
  'join.block.linksLeft': [['in Linked Accounts', `in ${LINKED}`]],
  'join.links.openLinked': [['in Linked Accounts', `in ${LINKED}`]],
  'join.next.stripeFailed': [['in Settings, Payments', 'in More, Plan & payments']],
  'setup.venue.alreadyLinked': [['use Create a collective on this tab', `use Create venue collective on ${VENUE_COLLECTIVES}`]],
  'setup.collective.no.body': [['from this tab', `from ${VENUE_COLLECTIVES}`]],
  'setup.done.next.collective': [['a banner on your dashboard', 'a banner in the app']],
  'setup.done.next.where': [['on this tab', `on ${LINKED_SCREEN}`]],
  'setup.done.next.watch': [['a notice on your dashboard and on this tab', `a notice in the app and on ${LINKED_SCREEN}`]],
  'respond.collective.linkOnly.note': [['stays open on this tab', `stays open on ${VENUE_COLLECTIVES}`]],
  'respond.done.joinFailed': [['from the collective’s row on this tab', `from ${VENUE_COLLECTIVES}`]],
  'respond.done.joined.next.host': [['A notice on your dashboard', 'A notice in the app']],
  'la.row.host.waiting': [['here and on your dashboard', 'here and in the app']],
  'la.row.invitation.pendingLink': [['on this tab', `on ${LINKED_SCREEN}`]],
  'finish.done.design.body': [['under Settings, Booking Page', 'under More, Booking page']],
  // Manage Collective (collective-area/copy.ts)
  'ov.venues.invite.link.notFullYou': [['in Linked Accounts', `in ${LINKED}`]],
  'ov.venues.invite.manageLinks': [['in Linked Accounts', `in ${LINKED}`]],
  'ov.venues.invite.linkCta': [['Go to Linked Accounts', `Go to ${LINKED}`]],
  'ov.linkTodo.change': [['in Linked Accounts', `in ${LINKED}`]],
  'leave.body.access': [['go to Linked accounts', `go to ${LINKED}`]],
  'bp.name.host.body': [['under Settings, Profile', 'under More, Venue profile']],
  'bp.name.collective.help': [['in your dashboard, for example on the Booking Page and Linked Accounts tabs,', `inside ResNeo, for example on the Booking page and ${LINKED} screens,`]],
};

/** The deck's sentence with the app's place names in it. Keys with no swaps come back unchanged. */
export function withAppPlaceNames(id: string, text: string): string {
  const swaps = APP_PLACE_NAMES[id];
  if (!swaps) return text;
  return swaps.reduce((out, [web, app]) => out.split(web).join(app), text);
}
